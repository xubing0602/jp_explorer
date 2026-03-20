# 行政区数据说明

本项目使用日本国土数值信息（N03 行政区域数据，基准日 2025-01-01）。
https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html#:~:text=2025%E5%B9%B4%EF%BC%88%E4%BB%A4%E5%92%8C7%E5%B9%B4%EF%BC%89%2C%203MB%2C%20N03%2D20250101_08_GML.zip%2C%20file_download%20star.%20%E8%8C%A8%E5%9F%8E%2C%20%E4%B8%96%E7%95%8C%E6%B8%AC%E5%9C%B0%E7%B3%BB%2C%202024%E5%B9%B4%EF%BC%88%E4%BB%A4%E5%92%8C6%E5%B9%B4%EF%BC%89%2C%202.88MB%2C%20N03%2D20240101_08_GML.zip%2C%20file_download%20star.
## 数据获取与转换

1. 下载 N03 行政区域数据（2025 版）并解压。
2. 使用 `mapshaper` 将市町村边界简化并导出为 TopoJSON。

示例命令（请根据解压后的文件名调整）：

```bash
# 进入 data 目录
cd /Users/bingxu/Desktop/Bing/projects/260319_jp_explorer/data

# 使用 mapshaper 转换（需要 Node.js 环境）
# 说明：
# - 从 N03-2025 的 shapefile 中读取行政区域
# - 过滤市区町村（N03_007 有值的记录）
# - 简化边界、保留属性
# - 输出单文件 TopoJSON
npx mapshaper \
  /path/to/N03-2025*.shp \
  -filter "N03_007 != null" \
  -simplify weighted 8% keep-shapes \
  -o format=topojson precision=0.0005 ../data/municipalities.topo.json
```

## 合规与署名

- 数据来源：国土数值信息（行政区域データ N03）。
- 使用前请确认并遵守国土数值信息下载服务的使用规约。
- 地图底图来自 OpenStreetMap，请保留署名。
