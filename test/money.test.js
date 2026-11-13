import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classifyStatus, encodeQuery, idempotencyKey} from '../src/ads-client.js';
import {currencyExponent, fromMicros, presentBudget, toMicros, toMinorUnits} from '../src/money.js';

test('micros: major units to integer micros without float error', () => {
  assert.equal(toMicros('50', 'USD'), 50000000);
  assert.equal(toMicros('2.5', 'USD'), 2500000);
  assert.equal(toMicros(0.1, 'USD'), 100000);
  assert.equal(toMicros('19.99', 'EUR'), 19990000);
  assert.equal(toMicros('120000', 'VND'), 120000000000); // MEASURED: VND daily minimum
  assert.equal(toMicros('12.345', 'KWD'), 12345000);
  assert.throws(() => toMicros('1.5', 'JPY'), /at most 0 decimals/);
  assert.throws(() => toMicros('1.234', 'USD'), /at most 2 decimals/);
  assert.throws(() => toMicros('-5', 'USD'), /plain non-negative/);
  assert.throws(() => toMicros('1e3', 'USD'), /plain non-negative/);
  assert.throws(() => toMicros('$5', 'USD'), /plain non-negative/);
});

test('micros: back to a readable amount in the currency own decimals', () => {
  assert.equal(fromMicros(50000000, 'USD'), '50.00');
  assert.equal(fromMicros(2500000, 'USD'), '2.50');
  assert.equal(fromMicros(120000000000, 'VND'), '120000');
  assert.equal(fromMicros(60000, 'USD'), '0.06'); // a 60 CPM bid per impression
  assert.equal(fromMicros(1, 'USD'), '0.000001'); // sub-cent micros are shown, not rounded away
  assert.equal(fromMicros(null, 'USD'), null);
  assert.deepEqual(presentBudget({daily_spend_limit_micros: 50000000}, 'USD'), {type: 'daily', amount: '50.00', currency: 'USD', micros: 50000000});
  assert.deepEqual(presentBudget({lifetime_spend_limit_micros: 25000000}, 'EUR')?.type, 'lifetime');
});

test('delta prices are ISO 4217 minor units, not micros', () => {
  assert.equal(toMinorUnits('79.99', 'USD'), 7999);
  assert.equal(toMinorUnits('7999', 'JPY'), 7999);
  assert.equal(toMinorUnits('12.5', 'KWD'), 12500);
  assert.equal(toMinorUnits('129.99', 'HUF'), 12999); // HUF has 2 decimals in ISO 4217
  assert.equal(currencyExponent('vnd'), 0);
  assert.equal(currencyExponent('XYZ'), 2);
});

test('errors are classified by HTTP status only', () => {
  assert.equal(classifyStatus(401, ''), 'KEY_INVALID');
  assert.equal(classifyStatus(403, 'Only ad account admins can perform this action.'), 'NOT_ADMIN');
  assert.equal(classifyStatus(403, 'Spend limit windows are not enabled for this ad account.'), 'FORBIDDEN');
  assert.equal(classifyStatus(404, ''), 'NOT_FOUND');
  assert.equal(classifyStatus(409, ''), 'CONFLICT');
  assert.equal(classifyStatus(413, ''), 'TOO_LARGE');
  assert.equal(classifyStatus(422, 'server_error'), 'INVALID_REQUEST');
  assert.equal(classifyStatus(400, ''), 'INVALID_REQUEST');
  assert.equal(classifyStatus(429, ''), 'RATE_LIMITED');
  assert.equal(classifyStatus(503, ''), 'UPSTREAM');
});

test('idempotency keys are stable per request body and differ between bodies', () => {
  assert.equal(idempotencyKey('campaign', {a: 1}), idempotencyKey('campaign', {a: 1}));
  assert.notEqual(idempotencyKey('campaign', {a: 1}), idempotencyKey('campaign', {a: 2}));
  assert.notEqual(idempotencyKey('campaign', {a: 1}), idempotencyKey('ad', {a: 1}));
  assert.equal(encodeQuery({'fields[]': ['a', 'b'], 'time_ranges[]': [{type: 'date_range'}], skip: undefined}), '?fields%5B%5D=a&fields%5B%5D=b&time_ranges%5B%5D=%7B%22type%22%3A%22date_range%22%7D');
});
