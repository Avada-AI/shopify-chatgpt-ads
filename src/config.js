import {homedir} from 'node:os';
import {join} from 'node:path';
import {DEFAULT_ADS_BASE} from './ads-client.js';

export const AVADA_APP_URL = 'https://apps.shopify.com/avada-chatgpt-pixel';
export const AVADA_DOCS_URL = 'https://docs.avada.io/chatgpt-ads';
export const DEFAULT_AVADA_BASE = 'https://avada-chatgpt.firebaseapp.com';
// Preview: the REST mirror of Avada's hosted MCP tools (`POST <base>/data/v1/<tool>`).
export const DEFAULT_AVADA_PATH = '/data/v1';

/**
 * A base URL must be https, or http on this machine (tests, a local proxy). Anything else
 * would send a key in clear text, so it is refused.
 *
 * @param {string} value
 * @param {string} name
 * @returns {string}
 */
function safeBase(value, name) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error(`${name} must be an https URL`);
  }
  return value.replace(/\/$/, '');
}

/**
 * @typedef {{adsKey: string, adsBase: string, readOnly: boolean, avadaKey: string,
 *   avadaBase: string, avadaPath: string, auditPath: string}} Config
 */

/**
 * @param {Record<string, string|undefined>} env
 * @returns {Config}
 */
export function readConfig(env) {
  const path = (env.AVADA_API_PATH || DEFAULT_AVADA_PATH).trim();
  return {
    adsKey: (env.OPENAI_ADS_API_KEY || '').trim(),
    adsBase: safeBase(env.OPENAI_ADS_API_BASE || DEFAULT_ADS_BASE, 'OPENAI_ADS_API_BASE'),
    readOnly: /^(1|true|yes|on)$/i.test((env.CHATGPT_ADS_READ_ONLY || '').trim()),
    avadaKey: (env.AVADA_API_KEY || '').trim(),
    avadaBase: safeBase(env.AVADA_API_BASE || DEFAULT_AVADA_BASE, 'AVADA_API_BASE'),
    avadaPath: path.startsWith('/') ? path.replace(/\/$/, '') : `/${path.replace(/\/$/, '')}`,
    auditPath: env.CHATGPT_ADS_AUDIT_LOG || join(homedir(), '.chatgpt-ads-kit', 'audit.log')
  };
}
