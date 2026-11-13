import {createHash} from 'node:crypto';

/**
 * Client for the OpenAI Advertiser API (https://api.ads.openai.com/v1).
 *
 * Facts it encodes (docs 2026-11-13, observed by Avada on a live ad account 2026-09 to 2026-11):
 * - updates are POST; the only PATCH is the feed Delta API
 * - errors are classified by HTTP status only; error bodies can say `server_error` on a 4xx
 * - a create is retried only when it carries an Idempotency-Key (no duplicate campaigns)
 * - schema validation runs before permission checks, so a 400 says nothing about access
 */

export const DEFAULT_ADS_BASE = 'https://api.ads.openai.com/v1';

/** Stable error codes, one per HTTP status family, with what the user can do about each. */
export const ADS_ERRORS = {
  KEY_MISSING: 'Set OPENAI_ADS_API_KEY to an Advertiser API key (Ads Manager > Settings > API keys), then restart your agent.',
  KEY_INVALID: 'OpenAI refused the key (401). Check OPENAI_ADS_API_KEY or create a new key in Ads Manager > Settings.',
  NOT_ADMIN: 'Only ad account admins can do this (403). Use an admin key, or do it in Ads Manager.',
  FORBIDDEN: 'OpenAI refused access (403): the feature may not be enabled for this ad account.',
  NOT_FOUND: 'Not found (404): check the id, and that it belongs to the ad account of this key. Archived objects leave list results but can still be read by id.',
  INVALID_REQUEST: 'OpenAI rejected the request (400/422). Read the message, fix the input and try again; nothing was changed.',
  CONFLICT: 'Conflict (409): the object changed or is in use. Read it again before retrying.',
  TOO_LARGE: 'The report is too large (413). Narrow the date range or the entities.',
  RATE_LIMITED: 'Rate limited (429). Wait a minute before trying again.',
  UPSTREAM: 'OpenAI had a server error (5xx). For a write, read the object back before retrying: the change may have been saved.',
  NETWORK: 'Could not reach OpenAI. Check the network and try again.'
};

/** Thrown for input the kit refuses before calling anyone. */
export class InputError extends Error {}

export class AdsError extends Error {
  /**
   * @param {keyof typeof ADS_ERRORS} code
   * @param {string} message
   * @param {{status?: number, param?: string|null}} [extra]
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'AdsError';
    this.code = code;
    this.status = extra.status || null;
    this.param = extra.param || null;
  }
}

/**
 * @param {number} status
 * @param {string} message
 * @returns {keyof typeof ADS_ERRORS}
 */
export function classifyStatus(status, message) {
  if (status === 401) return 'KEY_INVALID';
  if (status === 403) return /ad account admins/i.test(message) ? 'NOT_ADMIN' : 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM';
  return 'INVALID_REQUEST';
}

/**
 * Arrays become repeated keys (`fields[]=a&fields[]=b`); objects inside are JSON-encoded,
 * as the Insights endpoints expect for `time_ranges[]`, `filters[]` and `sort[]`.
 *
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
export function encodeQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    for (const item of [value].flat()) {
      sp.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item));
    }
  }
  const text = sp.toString();
  return text ? `?${text}` : '';
}

/**
 * Same logical create -> same key, so a retried create returns the first object (after an
 * archive the tools move on to a new key: createOnce in ./tools/ads.js).
 *
 * @param {string} kind
 * @param {unknown} body
 * @returns {string}
 */
export function idempotencyKey(kind, body) {
  const digest = createHash('sha256').update(`${kind}:${JSON.stringify(body)}`).digest('hex');
  return `cak-${kind}-${digest.slice(0, 40)}`;
}

/**
 * @param {{apiKey?: string, baseUrl?: string, fetch?: typeof fetch, retryBaseMs?: number,
 *   timeoutMs?: number}} options
 */
export function createAdsClient(options) {
  const baseUrl = (options.baseUrl || DEFAULT_ADS_BASE).replace(/\/$/, '');
  const doFetch = options.fetch || fetch;
  const retryBaseMs = options.retryBaseMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 30000;

  /**
   * @param {'GET'|'POST'|'PATCH'} method
   * @param {string} path
   * @param {{query?: Record<string, unknown>, body?: unknown, idempotencyKey?: string}} [opts]
   * @returns {Promise<any>}
   */
  async function request(method, path, opts = {}) {
    if (!options.apiKey) throw new AdsError('KEY_MISSING', 'OPENAI_ADS_API_KEY is not set');
    const retriable = method === 'GET' || Boolean(opts.idempotencyKey);
    /** @type {Record<string, string>} */
    const headers = {Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json'};
    // Every write is JSON, bodyless ones too (activate, pause, archive, preview).
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    const url = `${baseUrl}${path}${encodeQuery(opts.query)}`;
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      let message;
      let param = null;
      let retryAfterMs = NaN;
      try {
        const res = await doFetch(url, {
          method,
          headers,
          body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
          signal: AbortSignal.timeout(timeoutMs)
        });
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {raw: text.slice(0, 500)};
        }
        if (res.ok) return data;
        status = res.status;
        const err = data && typeof data.error === 'object' && data.error ? data.error : {};
        message = String(err.message || data?.message || data?.raw || `HTTP ${status}`);
        param = err.param || null;
        retryAfterMs = Number(res.headers.get('retry-after')) * 1000;
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      const code = status ? classifyStatus(status, message) : 'NETWORK';
      const transient = code === 'RATE_LIMITED' || code === 'UPSTREAM' || code === 'NETWORK';
      const waitMs = Number.isFinite(retryAfterMs) ? retryAfterMs : retryBaseMs * 2 ** attempt;
      if (transient && retriable && attempt < 2 && waitMs <= 5000) {
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw new AdsError(code, message, {status, param});
    }
  }

  return {
    get: (/** @type {string} */ path, /** @type {Record<string, unknown>} */ query = {}) =>
      request('GET', path, {query}),
    post: (/** @type {string} */ path, /** @type {unknown} */ body, /** @type {string} */ key = '') =>
      request('POST', path, {body, idempotencyKey: key || undefined}),
    patch: (/** @type {string} */ path, /** @type {unknown} */ body) => request('PATCH', path, {body}),
    /**
     * Walk a cursor list to the end, bounded so a huge account cannot loop forever.
     *
     * @param {string} path
     * @param {Record<string, unknown>} [query]
     * @param {number} [maxPages]
     * @returns {Promise<{data: any[], has_more: boolean}>}
     */
    async listAll(path, query = {}, maxPages = 10) {
      const data = [];
      let after;
      for (let page = 0; page < maxPages; page++) {
        const res = await request('GET', path, {query: {limit: 100, ...query, after}});
        data.push(...(res.data || []));
        if (!res.has_more || !res.last_id) return {data, has_more: false};
        after = res.last_id;
      }
      return {data, has_more: true};
    }
  };
}
