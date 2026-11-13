import {mkdir, open} from 'node:fs/promises';
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
      // A mode given to open applies only on creation: set it on every write, so a log created
      // earlier with a looser mode is tightened before anything more is added. (The directory
      // is left alone: it may be one the user shares, such as their home.)
      const file = await open(path, 'a', 0o600);
      try {
        await file.chmod(0o600);
        await file.appendFile(`${JSON.stringify({ts: new Date().toISOString(), ...entry})}\n`);
      } finally {
        await file.close();
      }
    }
  };
}
