import assert from 'node:assert/strict';
import test from 'node:test';
import { CACHE_KEY, convert, fetchRate, formatAmount, isStale, isValidRate, MAX_AMOUNT, parseAmount, readCache, writeCache } from '../currency-converter/converter.js';

const now = Date.parse('2026-10-26T06:00:00Z');
const rate = { rate: 6.7, updatedAt: new Date(now - 60_000).toISOString(), fetchedAt: now, provider: 'fxapi', kind: 'live' };
const livePayload = { base: 'USD', target: 'CNY', rate: 6.7, timestamp: rate.updatedAt };
const dailyPayload = { result: 'success', base_code: 'USD', rates: { CNY: 6.8 }, time_last_update_unix: now / 1000 - 3600 };
const jsonResponse = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });

test('parses empty, zero, decimal, grouped and full-width input', () => {
  for (const [input, result] of [['', null], ['  ', null], ['0', 0], ['000', 0], ['.25', 0.25], ['12.', 12], ['1,000.25', 1000.25], [' 123.45678901 ', 123.45678901], ['１，０００．２５', 1000.25], [String(MAX_AMOUNT), MAX_AMOUNT]]) {
    assert.equal(parseAmount(input), result, input);
  }
});

test('rejects negative, malformed, nonfinite, too precise and oversized amounts', () => {
  for (const input of ['-1', '+1', '1e3', 'NaN', 'Infinity', 'abc', '1 000', '12,34', '1,000,', '.', '0.123456789', '1.2.3', '1000000000001']) {
    assert.throws(() => parseAmount(input), undefined, input);
  }
});

test('converts both directions using the same rate, including zero and decimals', () => {
  assert.equal(convert(100, 'USD', 6.7), 670);
  assert.equal(convert(670, 'CNY', 6.7), 100);
  assert.equal(convert(0, 'CNY', 6.7), 0);
  assert.equal(convert(0.5, 'USD', 6.7), 3.35);
  assert.ok(Math.abs(convert(convert(123.45678, 'CNY', 6.7), 'USD', 6.7) - 123.45678) < 1e-9);
});

test('refuses invalid rates, amounts and overflow', () => {
  for (const invalid of [0, -1, NaN, Infinity]) assert.throws(() => convert(1, 'USD', invalid));
  for (const invalid of [-1, NaN, Infinity]) assert.throws(() => convert(invalid, 'CNY', 6.7));
  assert.throws(() => convert(1e12, 'USD', 1e308));
});

test('formats amounts and reference rates predictably', () => {
  assert.equal(formatAmount(1000), '1,000.00');
  assert.equal(formatAmount(0), '0.00');
  assert.equal(formatAmount(6.678912, 4), '6.6789');
});

test('validates cached rates and rejects corrupt, future, old or mislabeled data', () => {
  assert.ok(isValidRate(rate, now));
  for (const invalid of [null, {}, { ...rate, rate: 0 }, { ...rate, rate: '6.7' }, { ...rate, rate: NaN }, { ...rate, fetchedAt: Infinity }, { ...rate, fetchedAt: now + 3600_000 }, { ...rate, updatedAt: 'yesterday' }, { ...rate, updatedAt: new Date(now + 3600_000).toISOString() }, { ...rate, updatedAt: new Date(now - 8 * 86400_000).toISOString() }, { ...rate, kind: 'daily' }]) {
    assert.equal(isValidRate(invalid, now), false);
  }
});

test('cache survives unavailable storage and rejects malformed JSON', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.equal(readCache(storage, now), null);
  writeCache(storage, rate);
  assert.deepEqual(readCache(storage, now), rate);
  data.set(CACHE_KEY, '{broken');
  assert.equal(readCache(storage, now), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(readCache(blocked, now), null);
  assert.doesNotThrow(() => writeCache(blocked, rate));
});

test('stale thresholds differ for live and daily rates', () => {
  assert.equal(isStale(rate, now), false);
  assert.equal(isStale(rate, now + 16 * 60_000), true);
  assert.equal(isStale({ ...rate, provider: 'exchange-rate-api', kind: 'daily' }, now + 24 * 3600_000), false);
  assert.equal(isStale({ ...rate, provider: 'exchange-rate-api', kind: 'daily' }, now + 49 * 3600_000), true);
});

test('fetches live USD/CNY with CORS-safe options and no user amount', async () => {
  const calls = [];
  const result = await fetchRate(async (url, options) => { calls.push({ url, options }); return jsonResponse(livePayload); }, now);
  assert.equal(result.rate, 6.7);
  assert.equal(result.kind, 'live');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://fxapi.app/api/USD/CNY.json');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.ok(calls[0].options.signal);
});

test('falls back explicitly to daily data for network, HTTP, schema or pair errors', async () => {
  for (const failure of ['network', 'http', 'bad-rate', 'wrong-pair', 'bad-json']) {
    let calls = 0;
    const result = await fetchRate(async () => {
      calls++;
      if (calls === 2) return jsonResponse(dailyPayload);
      if (failure === 'network') throw new Error('Offline');
      if (failure === 'http') return jsonResponse({}, 429);
      if (failure === 'bad-json') return { ok: true, json: async () => { throw new Error('JSON'); } };
      return jsonResponse({ ...livePayload, ...(failure === 'bad-rate' ? { rate: -1 } : { target: 'EUR' }) });
    }, now);
    assert.equal(result.kind, 'daily', failure);
    assert.equal(result.provider, 'exchange-rate-api', failure);
    assert.equal(result.rate, 6.8, failure);
    assert.equal(calls, 2, failure);
  }
});

test('rejects both source failures rather than inventing a rate', async () => {
  await assert.rejects(fetchRate(async () => { throw new Error('offline'); }, now));
  await assert.rejects(fetchRate(async () => jsonResponse({}), now));
  let calls = 0;
  await assert.rejects(fetchRate(async () => jsonResponse(++calls === 1 ? {} : { ...dailyPayload, base_code: 'EUR' }), now));
});
