# Tools · 日常工具箱

独立、轻量的静态网页工具集合。各子项目放在独立目录中，无需后端即可部署。

## 子项目

- [人民币 ⇄ 美元](./currency-converter/)：查询最新参考汇率，输入任一币种金额进行双向换算。详见 [子项目说明](./currency-converter/README.md)。

## 本地访问

在仓库根目录运行 `python3 -m http.server 8000`，然后打开 `http://localhost:8000`。

## 发布

可将静态页面发布到 GitHub Pages 或任意静态网站托管服务。网站内的资源使用相对路径，兼容 GitHub Pages 项目站点。

使用 Node.js 24（`nvm use`）运行 `npm ci && npm run check`，生成仅含网站资源的 `dist/`。`npm run check` 包括 lint、严格 JavaScript 类型检查、单元/DOM 测试及构建。开发依赖不随网站发布。
