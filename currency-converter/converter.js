// @ts-check

export const MAX_AMOUNT = 1_000_000_000_000;
export const REFRESH_INTERVAL = 5 * 60 * 1000;
export const STALE_AFTER = 15 * 60 * 1000;
export const CACHE_KEY = 'tools.cny-usd.rate.v1';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

/** @typedef {'CNY' | 'USD'} Currency */
/** @typedef {{ rate: number, updatedAt: string, fetchedAt: number, provider: 'fxapi' | 'exchange-rate-api', kind: 'live' | 'daily' }} Rate */

/** @param {string} text @returns {number | null} */
export function parseAmount(text) {
  const value = text.trim().replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10)).replace(/，/g, ',').replace(/．/g, '.');
  if (!value) return null;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,8})?$|^\.\d{1,8}$/.test(value)) {
    throw new Error('请输入非负数字，最多 8 位小数；千分位请使用 1,000 的格式。');
  }
  const amount = Number(value.replaceAll(',', ''));
  if (!Number.isFinite(amount) || amount > MAX_AMOUNT) throw new Error('金额不能超过 1 万亿。');
  return amount;
}

/** @param {number} amount @param {Currency} from @param {number} usdToCny */
export function convert(amount, from, usdToCny) {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(usdToCny) || usdToCny <= 0) throw new Error('无效的金额或汇率。');
  const result = from === 'USD' ? amount * usdToCny : amount / usdToCny;
  if (!Number.isFinite(result)) throw new Error('换算结果超出可用范围。');
  return result;
}

/** @param {number} amount @param {number} [decimals] */
export function formatAmount(amount, decimals = 2) {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
}

/** @param {unknown} value @param {number} [now] @returns {value is Rate} */
export function isValidRate(value, now = Date.now()) {
  if (!value || typeof value !== 'object') return false;
  const item = /** @type {Partial<Rate>} */ (value);
  const time = Date.parse(item.updatedAt ?? '');
  return typeof item.rate === 'number' && Number.isFinite(item.rate) && item.rate > 0
    && Number.isFinite(time) && time <= now + REFRESH_INTERVAL && time >= now - MAX_CACHE_AGE
    && typeof item.fetchedAt === 'number' && Number.isFinite(item.fetchedAt) && item.fetchedAt <= now + REFRESH_INTERVAL && item.fetchedAt >= now - MAX_CACHE_AGE
    && ((item.provider === 'fxapi' && item.kind === 'live') || (item.provider === 'exchange-rate-api' && item.kind === 'daily'));
}

/** @param {Pick<Storage, 'getItem'>} storage @param {number} [now] @returns {Rate | null} */
export function readCache(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(CACHE_KEY) ?? 'null');
    return isValidRate(value, now) ? value : null;
  } catch { return null; }
}

/** @param {Pick<Storage, 'setItem'>} storage @param {Rate} rate */
export function writeCache(storage, rate) {
  try { storage.setItem(CACHE_KEY, JSON.stringify(rate)); } catch { /* Storage may be unavailable in private browsing. */ }
}

/** @param {Rate} rate @param {number} [now] */
export function isStale(rate, now = Date.now()) {
  return now - Date.parse(rate.updatedAt) > (rate.kind === 'live' ? STALE_AFTER : 48 * 60 * 60 * 1000);
}

/** @param {typeof fetch} fetcher @param {string} url */
async function fetchJson(fetcher, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, { signal: controller.signal, cache: 'no-cache', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

/** @param {typeof fetch} [fetcher] @param {number} [now] @returns {Promise<Rate>} */
export async function fetchRate(fetcher = fetch, now = Date.now()) {
  try {
    const data = await fetchJson(fetcher, 'https://fxapi.app/api/USD/CNY.json');
    const rate = { rate: data.rate, updatedAt: data.timestamp, fetchedAt: now, provider: 'fxapi', kind: 'live' };
    if (data.base !== 'USD' || data.target !== 'CNY' || !isValidRate(rate, now)) throw new Error('Invalid live rate');
    return rate;
  } catch {
    const data = await fetchJson(fetcher, 'https://open.er-api.com/v6/latest/USD');
    const rate = { rate: data.rates?.CNY, updatedAt: new Date(data.time_last_update_unix * 1000).toISOString(), fetchedAt: now, provider: 'exchange-rate-api', kind: 'daily' };
    if (data.result !== 'success' || data.base_code !== 'USD' || !isValidRate(rate, now)) throw new Error('Invalid daily rate');
    return rate;
  }
}
