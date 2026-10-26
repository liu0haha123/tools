# 人民币 ⇄ 美元

纯 HTML、CSS、ES modules 静态子项目。支持 CNY/USD 任一输入框输入、实时双向换算、显示顺序切换、快捷金额、刷新与本地汇率缓存。无需构建、后端或 API 密钥；直接用 HTTP 静态服务器打开本目录即可。

## 数据与“实时”的含义

- 首选 [fxapi.app](https://fxapi.app)：`https://fxapi.app/api/USD/CNY.json`。服务方标注约每 5 分钟更新；页面每 5 分钟检查一次，手动刷新至少间隔 15 秒。**不是逐笔银行或交易所报价。**
- 首选请求失败、超时或数据无效时，使用 [ExchangeRate-API Open Access](https://www.exchangerate-api.com/docs/free)：`https://open.er-api.com/v6/latest/USD`。该接口**每日更新**，页面明确标记“每日参考”，不冒充实时数据，并按要求提供署名链接。
- 两个接口均支持浏览器 CORS。每个请求最多等待 8 秒。外部接口的可用性、访问地域和数据准确性不由本项目保证。
- 双向换算使用同一 USD/CNY 报价及其倒数，避免两次请求产生不一致。输入金额不会上传到数据源。
- `localStorage` 仅保存汇率和时间。联网失败时保留最后有效汇率并显示警告；不使用硬编码或模拟汇率。超过 7 天的缓存不再加载。
- 实时源数据超过 15 分钟或备用日频数据超过 48 小时会标记过期。休市期间请结合源数据时间判断。
- 汇率和获取时间均显示在页面上。浏览器隐藏时不自动请求，恢复可见时按需检查。

## 金额输入

支持非负数、0、小数（最多 8 位）、标准千分位及全角数字；单次输入最大 1 万亿。空输入不视为 0。禁止负数、无穷值、科学计数法、不规范千分位等。结果四舍五入至两位小数，汇率保留更多位数；极小金额可能显示为 0.00。JavaScript 浮点运算仅用于参考换算，不适用于财务清算。

## 本地运行与部署

在仓库根目录执行 `python3 -m http.server 8000`，访问 `/currency-converter/`。不要用 `file://` 打开 ES modules 页面。

从仓库根目录运行 `npm ci && npm run check` 执行 lint、严格 JS 类型检查、单元/DOM 测试，并生成 `dist/`。可将 `dist/` 整体部署到任意静态托管平台，或将本目录单独作为站点根目录发布。

当前 GitHub Pages 的发布源为 `master` 分支的 `/ (root)` 目录，公开访问路径为 https://liu0haha123.github.io/tools/currency-converter/ 。仓库管理员在 Settings → Pages → Deploy from a branch 配置发布源。由于本项目无需构建即可运行，源码合并到 `master` 后由 GitHub 自动构建和部署；等待 Actions 中的 `pages build and deployment` 成功后才表示发布完成。其他静态托管平台仍可直接使用 `npm run build` 生成的 `dist/`。

## 隐私与安全

无统计追踪、第三方脚本、Cookie 或账号体系。汇率接口仅接收到固定货币对请求，不包含用户金额。CSP 限制脚本与网络连接目标；不需要也不应在前端放置付费 API 密钥。换汇会有点差、手续费及其他限制，以实际金融机构报价为准。
