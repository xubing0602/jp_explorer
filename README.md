# 日本市町村解锁地图

这是一个纯前端静态网页：在 Google Maps 上展示日本市町村边界，并根据 `data/visits.csv` 的“拜访程度(0-5)”进行上色与统计展示。

## 本地预览

使用任意静态服务器即可，例如：

```bash
python3 -m http.server 8080
```

然后打开：`http://localhost:8080`

## 配置 Google Maps API Key

本项目使用 Google Maps JavaScript API。请在 `index.html` 中替换为你的 key：

- `index.html` 里找到：
  - `https://maps.googleapis.com/maps/api/js?key=...`
- 将 `key` 替换为你自己的 Google Maps API Key（并确保已启用 Maps JavaScript API）。

## 数据准备（TopoJSON）

项目默认读取以下文件：

- 市町村边界：`data/municipalities2025.topo.json`
- 都道府县边界：`data/prefectures2025.topo.json`

如果你手上是 shapefile（本仓库 `data/` 下已包含 `N03-20250101*.shp`），可以用 `mapshaper` 生成：

```bash
# 市町村（过滤 N03_007 != null）
npx mapshaper data/N03-20250101.shp \
  -filter "N03_007 != null" \
  -simplify weighted 8% keep-shapes \
  -o format=topojson data/municipalities2025.topo.json

# 都道府县
npx mapshaper data/N03-20250101_prefecture.shp \
  -simplify weighted 8% keep-shapes \
  -o format=topojson data/prefectures2025.topo.json
```

如果遇到内存/卡顿问题，可以加大 `-simplify` 的百分比（例如 5%、3%）来进一步减小几何复杂度。

## CSV 数据（拜访程度）

CSV 文件：`data/visits.csv`，三列：

- `都道府县`
- `市町村`
- `拜访程度`：空/0=未去过，1=路过，2=接地，3=访问，4=宿泊，5=居住

页面会自动读取该 CSV 并渲染颜色与统计图表。

## 交互方式

- 鼠标悬停市町村：显示 tooltip，并高亮边界，方便定位。

## 部署到 GitHub Pages

1. 推送代码到 GitHub 仓库。
2. 在仓库设置中启用 GitHub Pages（Source 选择 `main` / `root`）。
3. 访问提供的 Pages 地址即可使用。
