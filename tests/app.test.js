import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { CACHE_KEY } from '../currency-converter/converter.js';

const html = await readFile(new URL('../currency-converter/index.html', import.meta.url), 'utf8');
const appCode = await readFile(new URL('../currency-converter/app.js', import.meta.url), 'utf8');
const coreCode = await readFile(new URL('../currency-converter/converter.js', import.meta.url), 'utf8');
const live = () => ({ base: 'USD', target: 'CNY', rate: 6.7, timestamp: new Date().toISOString() });
const response = (data) => ({ ok: true, json: async () => data });
async function settle() { for (let index = 0; index < 6; index++) await new Promise((resolve) => setImmediate(resolve)); }

async function boot(t, { fetcher = async () => response(live()), cache, blockedStorage = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://liu0haha123.github.io/tools/currency-converter/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const timers = [];
  const intervals = [];
  dom.window.fetch = fetcher;
  dom.window.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  dom.window.clearTimeout = () => {};
  dom.window.setInterval = (fn) => { intervals.push(fn); return intervals.length; };
  if (cache) dom.window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  if (blockedStorage) Object.defineProperty(dom.window, 'localStorage', { get() { throw new Error('blocked'); } });
  const context = dom.getInternalVMContext();
  const core = new vm.SourceTextModule(coreCode, { context });
  const app = new vm.SourceTextModule(appCode, { context });
  await app.link(() => core);
  await app.evaluate();
  await settle();
  const get = (id) => dom.window.document.getElementById(id);
  const input = (id, value) => { get(id).value = value; get(id).dispatchEvent(new dom.window.Event('input')); };
  return { dom, get, input, timers, intervals };
}

test('starts with a fetched rate and converts edits in both directions', async (t) => {
  const { get, input } = await boot(t);
  assert.equal(get('usd-amount').value, '149.25');
  assert.match(get('rate-value').textContent, /1 USD = 6.7000 CNY/);
  input('usd-amount', '100.50');
  assert.equal(get('cny-amount').value, '673.35');
  input('cny-amount', '6,700');
  assert.equal(get('usd-amount').value, '1,000.00');
  assert.equal(get('status-label').textContent, '最新汇率');
  assert.match(get('update-time').textContent, /数据更新：.+获取：/);
});

test('zero, empty and invalid input never leave a misleading old result', async (t) => {
  const { get, input } = await boot(t);
  input('cny-amount', '0');
  assert.equal(get('usd-amount').value, '0.00');
  input('cny-amount', '');
  assert.equal(get('usd-amount').value, '');
  input('usd-amount', '-1');
  assert.equal(get('cny-amount').value, '');
  assert.equal(get('usd-amount').getAttribute('aria-invalid'), 'true');
  assert.match(get('amount-error').textContent, /非负数字/);
  input('usd-amount', '10');
  assert.equal(get('amount-error').textContent, '');
  assert.equal(get('cny-amount').value, '67.00');
});

test('swap preserves values, quick amounts use the displayed direction, and clear resets', async (t) => {
  const { dom, get } = await boot(t);
  const before = [get('cny-amount').value, get('usd-amount').value];
  get('swap-button').click();
  assert.equal(get('amount-fields').firstElementChild.id, 'usd-panel');
  assert.deepEqual([get('cny-amount').value, get('usd-amount').value], before);
  dom.window.document.querySelector('[data-amount="100"]').click();
  assert.equal(get('usd-amount').value, '100');
  assert.equal(get('cny-amount').value, '670.00');
  get('swap-button').click();
  assert.equal(get('amount-fields').firstElementChild.id, 'cny-panel');
  get('clear-button').click();
  assert.equal(get('usd-amount').value, '');
  assert.equal(get('cny-amount').value, '');
  assert.equal(dom.window.document.activeElement.id, 'cny-amount');
});

test('refresh preserves the typed source amount and updates its target', async (t) => {
  let current = 6.7;
  const { get, input, timers } = await boot(t, { fetcher: async () => response({ ...live(), rate: current }) });
  input('usd-amount', '123.45');
  const clock = new Date();
  const later = clock.getTime() + 16_000;
  // Override only the isolated page's clock, not the Node test process.
  const document = get('cny-amount').ownerDocument;
  document.defaultView.Date.now = () => later;
  timers.find((timer) => timer.delay === 15000)?.fn();
  current = 7;
  get('refresh-button').disabled = false;
  get('refresh-button').click();
  await settle();
  assert.equal(get('usd-amount').value, '123.45');
  assert.equal(get('cny-amount').value, '864.15');
});

test('daily fallback is visibly distinguished from live data', async (t) => {
  const { get } = await boot(t, { fetcher: async (url) => {
    if (url.includes('fxapi.app')) throw new Error('unavailable');
    return response({ result: 'success', base_code: 'USD', rates: { CNY: 7 }, time_last_update_unix: Math.floor(Date.now() / 1000) });
  } });
  assert.equal(get('status-label').textContent, '每日参考');
  assert.match(get('rate-notice').textContent, /非实时/);
  assert.equal(get('usd-amount').value, '142.86');
});

test('offline with cache converts with an explicit warning', async (t) => {
  const cache = { rate: 7, updatedAt: new Date(Date.now() - 3600_000).toISOString(), fetchedAt: Date.now() - 3600_000, provider: 'fxapi', kind: 'live' };
  const { get } = await boot(t, { cache, fetcher: async () => { throw new Error('offline'); } });
  assert.equal(get('usd-amount').value, '142.86');
  assert.equal(get('status-label').textContent, '缓存汇率');
  assert.match(get('rate-notice').textContent, /可能已过期/);
});

test('offline without cache shows no invented result, while keeping input editable', async (t) => {
  const { get, input } = await boot(t, { fetcher: async () => { throw new Error('offline'); } });
  assert.equal(get('status-label').textContent, '连接失败');
  assert.equal(get('usd-amount').value, '');
  input('usd-amount', '123');
  assert.equal(get('usd-amount').value, '123');
  assert.equal(get('cny-amount').value, '');
  assert.match(get('rate-notice').textContent, /未使用任何模拟汇率/);
});

test('storage denial does not break live conversion', async (t) => {
  const { get } = await boot(t, { blockedStorage: true });
  assert.equal(get('usd-amount').value, '149.25');
  assert.equal(get('status-label').textContent, '最新汇率');
});

test('stale source data is labeled expired instead of latest', async (t) => {
  const { get } = await boot(t, { fetcher: async () => response({ ...live(), timestamp: new Date(Date.now() - 3600_000).toISOString() }) });
  assert.equal(get('status-label').textContent, '数据已过期');
  assert.match(get('rate-notice').textContent, /已过期/);
});

test('does not auto-fetch while hidden and refreshes on returning to the page', async (t) => {
  let calls = 0;
  const { dom, intervals } = await boot(t, { fetcher: async () => { calls++; return response(live()); } });
  const later = Date.now() + 6 * 60_000;
  dom.window.Date.now = () => later;
  Object.defineProperty(dom.window.document, 'hidden', { configurable: true, value: true });
  intervals[0]();
  await settle();
  assert.equal(calls, 1);
  Object.defineProperty(dom.window.document, 'hidden', { value: false });
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  await settle();
  assert.equal(calls, 2);
});
