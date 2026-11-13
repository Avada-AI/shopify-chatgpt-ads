// Money units used by the OpenAI Ads API (docs fetched 2026-11-13):
// - budgets and bids: integer MICROS of the ad account currency (1 unit = 1,000,000 micros)
// - Delta feed prices: integer MINOR units (ISO 4217 exponent: 7999 = 79.99 USD, 7999 = 7,999 JPY)
// - Insights spend, cpc, cpm: plain numbers in MAJOR units (never convert them)
// String arithmetic with BigInt, so 0.1 + 0.2 never happens to anyone's budget.

/** ISO 4217 currencies whose minor unit is not 2 (list published 2026-09-17). Others: 2. */
const EXPONENT = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0,
  UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4
};

/**
 * @param {string} currency ISO 4217 code
 * @returns {number} fractional digits the currency uses
 */
export function currencyExponent(currency) {
  const code = String(currency || '').toUpperCase();
  return Object.hasOwn(EXPONENT, code) ? EXPONENT[code] : 2;
}

/**
 * Parse a non-negative decimal amount into [integer part, fraction digits].
 *
 * @param {string|number} amount
 * @returns {{whole: bigint, fraction: string}}
 */
function parseAmount(amount) {
  const text = typeof amount === 'number' ? String(amount) : String(amount ?? '').trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new RangeError(`"${text}" is not a plain non-negative amount such as 50 or 12.50`);
  return {whole: BigInt(match[1]), fraction: (match[2] || '').replace(/0+$/, '')};
}

/**
 * Major units of the account currency -> integer micros, refusing more decimals than the
 * currency has (OpenAI asks for amounts in the currency's smallest unit).
 *
 * @param {string|number} amount e.g. "50" or "12.5"
 * @param {string} currency
 * @returns {number}
 */
export function toMicros(amount, currency) {
  const {whole, fraction} = parseAmount(amount);
  const exp = currencyExponent(currency);
  if (fraction.length > exp) {
    throw new RangeError(`${currency} amounts take at most ${exp} decimals; got ${amount}`);
  }
  const micros = whole * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`${amount} is too large`);
  return Number(micros);
}

/**
 * Integer micros -> a decimal string in major units with the currency's own decimals.
 *
 * @param {number|null|undefined} micros
 * @param {string} currency
 * @returns {string|null}
 */
export function fromMicros(micros, currency) {
  if (micros === null || micros === undefined || !Number.isFinite(Number(micros))) return null;
  const exp = currencyExponent(currency);
  const value = BigInt(Math.trunc(Number(micros)));
  const whole = value / 1000000n;
  const rest = (value % 1000000n).toString().padStart(6, '0');
  const kept = rest.slice(0, exp);
  const dropped = rest.slice(exp).replace(/0+$/, '');
  // Show sub-unit micros rather than silently rounding them away.
  const fraction = dropped ? rest.replace(/0+$/, '') : kept;
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/**
 * Major units -> integer minor units (ISO 4217), as the Delta feed API wants prices.
 *
 * @param {string|number} amount e.g. "79.99"
 * @param {string} currency
 * @returns {number}
 */
export function toMinorUnits(amount, currency) {
  const {whole, fraction} = parseAmount(amount);
  const exp = currencyExponent(currency);
  if (fraction.length > exp) {
    throw new RangeError(`${currency} prices take at most ${exp} decimals; got ${amount}`);
  }
  const minor = whole * 10n ** BigInt(exp) + BigInt(fraction.padEnd(exp, '0') || '0');
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`${amount} is too large`);
  return Number(minor);
}

/**
 * A budget object from OpenAI, presented in both units.
 *
 * @param {{daily_spend_limit_micros?: number, lifetime_spend_limit_micros?: number}|null|undefined} budget
 * @param {string} currency
 * @returns {{type: 'daily'|'lifetime', amount: string|null, currency: string, micros: number}|null}
 */
export function presentBudget(budget, currency) {
  if (!budget) return null;
  if (budget.daily_spend_limit_micros !== undefined && budget.daily_spend_limit_micros !== null) {
    const micros = budget.daily_spend_limit_micros;
    return {type: 'daily', amount: fromMicros(micros, currency), currency, micros};
  }
  if (budget.lifetime_spend_limit_micros !== undefined && budget.lifetime_spend_limit_micros !== null) {
    const micros = budget.lifetime_spend_limit_micros;
    return {type: 'lifetime', amount: fromMicros(micros, currency), currency, micros};
  }
  return null;
}
