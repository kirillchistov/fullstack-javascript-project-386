import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

/**
 * Схемы валидации не пишутся руками — они берутся из скомпилированного
 * контракта docs/api/openapi.yaml (источник — spec/*.tsp).
 */

const contractPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/api/openapi.yaml',
);

const contract = loadYaml(fs.readFileSync(contractPath, 'utf8'));

/**
 * Адаптация схем OpenAPI под Ajv:
 * - '#/components/schemas/X' -> 'X#' (shared-схемы Fastify);
 * - удаление ключа `example` (OpenAPI-специфичный, Ajv strict его не знает).
 */
function rewriteRefs(node) {
  if (Array.isArray(node)) return node.map(rewriteRefs);
  if (node && typeof node === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'example') continue;
      if (key === '$ref' && typeof value === 'string') {
        result.$ref = `${value.replace('#/components/schemas/', '')}#`;
      } else {
        result[key] = rewriteRefs(value);
      }
    }
    return result;
  }
  return node;
}

/** Все схемы компонентов контракта для fastify.addSchema */
export function componentSchemas() {
  return Object.entries(contract.components.schemas).map(([name, schema]) => ({
    $id: name,
    ...rewriteRefs(schema),
  }));
}

/** Ссылка на shared-схему по имени модели контракта */
export const ref = (name) => ({ $ref: `${name}#` });
