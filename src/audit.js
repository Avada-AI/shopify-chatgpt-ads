import {appendFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

/**
 * Append-only JSON-lines log of every write the kit attempts, readable only by the user.
 * Callers pass already-redacted data; keys never reach this file.
 *
 * @param {string} path
 */
export function createAuditLog(path) {
  return {
    path,
    /** @param {Record<string, unknown>} entry */
    async write(entry) {
      await mkdir(dirname(path), {recursive: true, mode: 0o700});
      await appendFile(path, `${JSON.stringify({ts: new Date().toISOString(), ...entry})}\n`, {
        mode: 0o600
      });
    }
  };
}
