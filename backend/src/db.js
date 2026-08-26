import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './passwords.js';

/**
 * SQLite через встроенный node:sqlite (Node 22+).
 * DATABASE_PATH=:memory: — для тестов; иначе файл (по умолчанию data/call-calendar.sqlite).
 */
export function openDatabase(databasePath = process.env.DATABASE_PATH) {
  const filePath = databasePath ?? path.resolve('data', 'call-calendar.sqlite');
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  seedIfEmpty(db);
  return db;
}

function columnExists(db, table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some((c) => c.name === column);
}

function migrate(db) {
  // CREATE TABLE IF NOT EXISTS не обновляет уже существующие таблицы:
  // колонки P1 добавляются ниже через ALTER, индексы — только после них.
  db.exec(`
    CREATE TABLE IF NOT EXISTS owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability (
      owner_id INTEGER PRIMARY KEY REFERENCES owners(id) ON DELETE CASCADE,
      timezone TEXT NOT NULL,
      rules_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
      event_type_id INTEGER NOT NULL REFERENCES event_types(id),
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      guest_name TEXT NOT NULL,
      guest_email TEXT NOT NULL,
      comment TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      owner_id INTEGER PRIMARY KEY REFERENCES owners(id) ON DELETE CASCADE,
      email_enabled INTEGER NOT NULL DEFAULT 1,
      telegram_chat_id TEXT,
      reminder_hours_before INTEGER NOT NULL DEFAULT 24
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_owner_status
      ON bookings(owner_id, status, starts_at);
  `);

  // Миграции для БД, созданных до P1 (и для свежих таблиц без новых колонок)
  if (!columnExists(db, 'availability', 'buffer_minutes')) {
    db.exec('ALTER TABLE availability ADD COLUMN buffer_minutes INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists(db, 'availability', 'exceptions_json')) {
    db.exec(`ALTER TABLE availability ADD COLUMN exceptions_json TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!columnExists(db, 'bookings', 'manage_token')) {
    db.exec('ALTER TABLE bookings ADD COLUMN manage_token TEXT');
  }
  if (!columnExists(db, 'bookings', 'reminder_sent_at')) {
    db.exec('ALTER TABLE bookings ADD COLUMN reminder_sent_at TEXT');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bookings_manage_token
      ON bookings(manage_token);
  `);

  // Токены для старых броней без manage_token
  const withoutToken = db
    .prepare(`SELECT id FROM bookings WHERE manage_token IS NULL OR manage_token = ''`)
    .all();
  const setToken = db.prepare('UPDATE bookings SET manage_token = ? WHERE id = ?');
  for (const row of withoutToken) {
    setToken.run(cryptoRandom(), row.id);
  }
}

function cryptoRandom() {
  return globalThis.crypto.randomUUID();
}

/** Сид для локальной разработки, Docker и e2e */
function seedIfEmpty(db) {
  const row = db.prepare('SELECT COUNT(*) AS c FROM owners').get();
  if (row.c > 0) return;

  const now = new Date().toISOString();
  const email = process.env.OWNER_EMAIL ?? 'owner@example.com';
  const password = process.env.OWNER_PASSWORD ?? 'secret';
  const name = process.env.OWNER_NAME ?? 'Кирилл Чистов';
  const slug = process.env.OWNER_SLUG ?? 'kirill';
  const timezone = process.env.OWNER_TIMEZONE ?? 'Europe/Moscow';

  const result = db
    .prepare(
      `INSERT INTO owners (name, email, slug, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(name, email, slug, hashPassword(password), now);
  const ownerId = Number(result.lastInsertRowid);

  const rules = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startTime: '10:00',
    endTime: '18:00',
  }));
  db.prepare(
    `INSERT INTO availability (owner_id, timezone, rules_json, buffer_minutes, exceptions_json)
     VALUES (?, ?, ?, 0, '[]')`,
  ).run(ownerId, timezone, JSON.stringify(rules));

  db.prepare(
    `INSERT INTO notification_settings (owner_id, email_enabled, reminder_hours_before)
     VALUES (?, 1, 24)`,
  ).run(ownerId);

  const insertEt = db.prepare(`
    INSERT INTO event_types (owner_id, name, description, duration_minutes)
    VALUES (?, ?, ?, ?)
  `);
  insertEt.run(ownerId, 'Вводный звонок', 'Знакомство и обсуждение задачи', 30);
  insertEt.run(ownerId, 'Консультация', 'Разбор вопросов по проекту', 60);
}
