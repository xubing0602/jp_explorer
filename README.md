# 日本市町村去过地图

这是一个纯前端静态网页：展示日本市町村边界并标记你去过的地方。标记存储在浏览器本地，可导出/导入。

## 本地预览

使用任意静态服务器即可，例如：

```bash
python3 -m http.server 8080
```

然后打开：`http://localhost:8080`

## 数据准备

请按 `data/README.md` 的说明生成 `data/municipalities.topo.json`。

## 部署到 GitHub Pages

1. 推送代码到 GitHub 仓库。
2. 在仓库设置中启用 GitHub Pages（Source 选择 `main` / `root`）。
3. 访问提供的 Pages 地址即可使用。
