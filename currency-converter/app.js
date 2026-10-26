// @ts-check
import { convert, fetchRate, formatAmount, isStale, parseAmount, readCache, REFRESH_INTERVAL, writeCache } from './converter.js';

/** @param {string} id @returns {HTMLElement} */
function element(id) {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value;
}

const inputs = {
  CNY: /** @type {HTMLInputElement} */ (element('cny-amount')),
  USD: /** @type {HTMLInputElement} */ (element('usd-amount')),
};
const refreshButton = /** @type {HTMLButtonElement} */ (element('refresh-button'));
const fields = element('amount-fields');
/** @type {import('./converter.js').Currency} */
let source = 'CNY';
/** @type {import('./converter.js').Currency} */
let direction = 'CNY';
/** @type {import('./converter.js').Rate | null} */
let rate = null;
let busy = false;
let networkFailed = false;
let usingCache = false;
let lastAttempt = 0;
let lastCheck = 0;

function clearError() {
  element('amount-error').textContent = '';
  Object.values(inputs).forEach((input) => input.removeAttribute('aria-invalid'));
}

function calculate() {
  const target = source === 'CNY' ? 'USD' : 'CNY';
  clearError();
  try {
    const amount = parseAmount(inputs[source].value);
    if (amount === null || !rate) { inputs[target].value = ''; return; }
    const result = convert(amount, source, rate.rate);
    inputs[target].value = formatAmount(result);
  } catch (error) {
    inputs[source].setAttribute('aria-invalid', 'true');
    inputs[target].value = '';
    element('amount-error').textContent = error instanceof Error ? error.message : '请输入有效金额。';
  }
}

function renderRate() {
  const badge = element('status-badge');
  const label = element('status-label');
  const notice = element('rate-notice');
  if (!rate) {
    badge.dataset.state = busy ? 'loading' : 'error';
    label.textContent = busy ? '正在获取' : '连接失败';
    element('rate-value').textContent = busy ? '正在查询最新汇率…' : '暂时无法获取汇率';
    notice.textContent = busy ? '正在连接汇率数据源…' : '两个汇率源均无法连接，请检查网络后点击刷新。未使用任何模拟汇率。';
    return;
  }
  const stale = isStale(rate);
  const cached = networkFailed || usingCache;
  badge.dataset.state = stale || cached || rate.kind === 'daily' ? 'warning' : 'live';
  label.textContent = cached ? '缓存汇率' : stale ? '数据已过期' : rate.kind === 'daily' ? '每日参考' : '最新汇率';
  element('rate-value').textContent = `1 USD = ${formatAmount(rate.rate, 4)} CNY`;
  element('inverse-value').textContent = `1 CNY = ${formatAmount(1 / rate.rate, 6)} USD`;
  notice.textContent = cached ? (busy && !networkFailed ? '正在检查更新，暂时显示上次缓存。' : '网络连接失败，正在使用上次缓存；该汇率可能已过期，请谨慎参考。')
    : stale ? '数据源尚未提供新报价（可能为休市或网络延迟），当前汇率已过期。'
    : rate.kind === 'daily' ? '实时源暂不可用，已切换至每日参考汇率（非实时）。'
    : '每 5 分钟检查更新 · 非银行成交报价';
  const updated = new Date(rate.updatedAt).toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' });
  const checked = new Date(rate.fetchedAt).toLocaleTimeString('zh-CN', { hour12: false });
  element('update-time').textContent = `数据更新：${updated} · 获取：${checked}`;
}

async function refresh() {
  if (busy || Date.now() - lastAttempt < 15_000) return;
  lastAttempt = Date.now();
  lastCheck = lastAttempt;
  busy = true;
  refreshButton.disabled = true;
  element('refresh-label').textContent = '更新中…';
  renderRate();
  try {
    rate = await fetchRate();
    networkFailed = false;
    usingCache = false;
    try { writeCache(localStorage, rate); } catch { /* The browser can deny localStorage access. */ }
    calculate();
  } catch {
    networkFailed = true;
  } finally {
    busy = false;
    renderRate();
    element('refresh-label').textContent = '刷新汇率';
    setTimeout(() => { refreshButton.disabled = false; }, Math.max(0, 15_000 - (Date.now() - lastAttempt)));
  }
}

/** @param {import('./converter.js').Currency} currency */
function setSource(currency) {
  source = currency;
}

for (const currency of /** @type {const} */ (['CNY', 'USD'])) {
  inputs[currency].addEventListener('input', () => { setSource(currency); calculate(); });
}

element('swap-button').addEventListener('click', () => {
  direction = direction === 'CNY' ? 'USD' : 'CNY';
  document.body.dataset.direction = direction;
  fields.insertBefore(element(direction === 'CNY' ? 'cny-panel' : 'usd-panel'), fields.firstChild);
  fields.appendChild(element(direction === 'CNY' ? 'usd-panel' : 'cny-panel'));
  // Keep the full current calculation intact; subsequent edits choose a new source.
  inputs[direction].focus();
});

document.querySelectorAll('button[data-amount]').forEach((button) => {
  button.addEventListener('click', () => {
    inputs[direction].value = /** @type {HTMLElement} */ (button).dataset.amount ?? '';
    setSource(direction);
    calculate();
  });
});

element('clear-button').addEventListener('click', () => {
  Object.values(inputs).forEach((input) => { input.value = ''; });
  clearError();
  inputs[direction].focus();
});

refreshButton.addEventListener('click', refresh);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastCheck >= REFRESH_INTERVAL) void refresh();
});
window.addEventListener('online', () => { void refresh(); });
setInterval(() => {
  renderRate();
  if (!document.hidden && Date.now() - lastCheck >= REFRESH_INTERVAL) void refresh();
}, 30_000);

try { rate = readCache(localStorage); } catch { /* Conversion also works when storage is disabled. */ }
if (rate) { usingCache = true; renderRate(); calculate(); }
void refresh();
