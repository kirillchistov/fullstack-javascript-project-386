/**
 * Минимальный разбор ICS: VEVENT с DTSTART / DTEND (UTC или с Z).
 * Не полный RFC5545 — достаточно для busy sync MVP.
 */

function unfoldIcs(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseIcsDate(value) {
  if (!value) return null;
  // DTSTART:20260727T100000Z или DTSTART;VALUE=DATE:20260727
  const raw = value.includes(':') ? value.split(':').pop() : value;
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return Date.parse(`${y}-${m}-${d}T00:00:00Z`);
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] || 'Z'}`;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * @param {string} icsText
 * @returns {{ startsAt: string, endsAt: string }[]}
 */
export function parseIcsBusy(icsText) {
  const text = unfoldIcs(icsText);
  const events = text.split('BEGIN:VEVENT').slice(1);
  const busy = [];
  for (const chunk of events) {
    const body = chunk.split('END:VEVENT')[0] ?? '';
    let dtStart = null;
    let dtEnd = null;
    for (const line of body.split(/\r?\n/)) {
      if (line.startsWith('DTSTART')) dtStart = parseIcsDate(line);
      if (line.startsWith('DTEND')) dtEnd = parseIcsDate(line);
    }
    if (dtStart != null && dtEnd != null && dtEnd > dtStart) {
      busy.push({
        startsAt: new Date(dtStart).toISOString(),
        endsAt: new Date(dtEnd).toISOString(),
      });
    }
  }
  return busy;
}

/**
 * @param {string} url
 * @returns {Promise<{ startsAt: string, endsAt: string }[]>}
 */
export async function fetchIcsBusy(url) {
  const response = await fetch(url, {
    headers: { Accept: 'text/calendar, text/plain, */*' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const err = new Error(`Не удалось загрузить ICS (${response.status})`);
    err.code = 'validation_error';
    throw err;
  }
  const text = await response.text();
  return parseIcsBusy(text);
}
