# Bing Wallpaper

基于 Cloudflare Workers + Assets 的 Bing 壁纸画廊，自动获取每日壁纸。

## 功能

- 每天 UTC 04:05 和 16:05（北京时间 12:05 和 00:05）自动获取多个市场的 Bing 壁纸
- 支持 13 个市场：中国、美国、英国、德国、法国、日本、加拿大、印度、西班牙、意大利、巴西等
- 首页市场切换，一键查看不同地区壁纸
- 时间线导航，快速跳转到年份/月份
- 响应式设计，支持手机和电脑
- 懒加载优化，只加载可见区域图片
- 管理面板：导入、导出、删除数据
- 树形数据管理，支持按市场/年/月/日删除
- 年度自动归档，节省存储空间
- Token 认证保护管理操作

## 部署

### GitHub Actions 自动部署

**1. Fork 本仓库**

**2. 创建 Cloudflare API Token**

前往 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)，点击 `Create Token`，选择 `Edit Cloudflare Workers` 模板。

**3. 配置 GitHub Secrets**

在 Fork 的仓库中，进入 `Settings > Secrets and variables > Actions`，添加：

| Name                    | Value               |
| ----------------------- | ------------------- |
| `CLOUDFLARE_API_TOKEN`  | 上一步创建的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID  |
| `AUTH_TOKEN`            | 管理面板认证密码      |

**4. 推送代码**

推送到 `main` 分支即可自动部署。

## 使用

部署成功后：

- **首页**：`https://bing.<子域>.workers.dev/` - 壁纸画廊
- **管理面板**：`https://bing.<子域>.workers.dev/admin/` - 数据管理

### 市场切换

首页右下角有国旗图标按钮，点击可选择不同市场的壁纸：
- 🇨🇳 中国 (zh-CN)
- 🇺🇸 美国 (en-US)
- 🇬🇧 英国 (en-GB)
- 🇩🇪 德国 (de-DE)
- 🇫🇷 法国 (fr-FR)
- 🇯🇵 日本 (ja-JP)
- 🇨🇦 加拿大 (en-CA, fr-CA)
- 🇮🇳 印度 (en-IN)
- 🇪🇸 西班牙 (es-ES)
- 🇮🇹 意大利 (it-IT)
- 🇧🇷 巴西 (pt-BR)
- 🇺🇳 国际 (en-WW)

## API

### 公开接口

| 端点         | 方法   | 说明                                              |
| ------------ | ------ | ------------------------------------------------- |
| `/api/manifest` | GET | 各市场有数据的月份索引 + 最新一条，用于渲染时间线     |
| `/api/month` | GET    | 按月份 + 市场拉取壁纸列表                           |
| `/api/today` | GET    | 直接返回当天壁纸图片（可当壁纸源使用）              |
| `/api/login` | POST   | 登录认证，Body: `{ "token": "xxx" }`              |

> 全量接口 `/json` 已移除。首页与管理面板均使用 `/api/manifest` 渲染结构 + `/api/month` 按需加载明细。

### 月份索引与按月加载

首页不再内联全量数据，改为注入轻量索引（`window.__BING_MANIFEST__`）。

`GET /api/manifest` 返回全部市场索引，`GET /api/manifest?market=zh-CN` 只返回该市场：

```json
{
  "months": { "zh-CN": ["202302", "202303", "..."], "en-US": ["202102", "..."] },
  "counts": { "zh-CN": { "202302": 28, "202303": 31 } },
  "latest": { "zh-CN": { "date": "20260506", "copyright": "...", "image_url": "..." } },
  "market_time_config": { "zh-CN": { "start_ym": "202302", "end_ym": "202605" } }
}
```

`GET /api/month?ym=202601&market=zh-CN` 返回该月该市场的记录（按日期降序）：

```json
{
  "ym": "202601",
  "market": "zh-CN",
  "count": 31,
  "data": [{ "date": "20260131", "title": "...", "copyright": "...", "image_url": "..." }]
}
```

- 默认剔除 `description` 字段（占全量体积 80% 以上，列表渲染不需要），需要完整内容时加 `?full=1`
- 索引缓存在 KV 的 `market_index` 键中，导入/删除/更新/归档后自动失效重建
- 前端优先加载视口附近的月份，其余在浏览器空闲时逐月预取

### 当天壁纸图片接口

`GET /api/today` 直接返回图片二进制（`Content-Type: image/jpeg`），可直接作为壁纸地址使用：

```
https://bing.<子域>.workers.dev/api/today
https://bing.<子域>.workers.dev/api/today?market=en-US
```

- `market` 参数可选，默认 `zh-CN`
- 优先返回当天壁纸；当天尚未抓取时回退到本月最新一张，再回退到上月最新一张
- 当天壁纸缓存到次日零点（`max-age` 动态计算），历史回退时缓存 10 分钟以便及时更新
- 响应头附带 `ETag`（`"<market>-<date>"`），支持 `If-None-Match` 条件请求返回 `304`
- 响应头附带 `X-Wallpaper-Date` 与 `X-Wallpaper-Market`，便于排查
- 支持 `HEAD` 请求，无数据时返回 `404` JSON 错误

### 认证接口（需要 Token）

请求头添加 `Authorization: Bearer <token>`

| 端点          | 方法   | 说明                                       |
| ------------- | ------ | ------------------------------------------ |
| `/update`     | GET    | 手动更新，从所有市场的 Bing API 获取最新壁纸 |
| `/api/import` | POST   | 导入数据                                    |
| `/api/delete` | POST   | 删除数据，支持按年/月/日/市场删除            |
| `/api/archive`| POST   | 归档数据                                    |

### 删除接口参数

`/api/delete` 支持多种粒度：

```json
{ "market": "zh-CN" }                      // 删除该市场所有数据
{ "year": "2025" }                         // 删除该年所有市场数据
{ "year": "2025", "market": "zh-CN" }      // 删除该年指定市场数据
{ "month": "202505" }                      // 删除该月所有市场数据
{ "month": "202505", "market": "zh-CN" }   // 删除该月指定市场数据
{ "date": "20250501" }                     // 删除该日所有市场数据
{ "date": "20250501", "market": "zh-CN" }  // 删除该日指定市场数据
```

### 归档接口参数

`/api/archive` 支持手动归档：

```json
{ "year": "2024" }   // 归档指定年份
{}                   // 自动检查是否需要归档（1月1日自动归档去年）
```

### 导入数据格式

```json
{
  "data": {
    "2024": {
      "202401": {
        "zh-CN": [
          { "date": "20240101", "copyright": "描述", "image_url": "..." }
        ]
      }
    }
  }
}
```

### 数据格式

```json
{
  "data": {
    "2024": {
      "202401": {
        "zh-CN": [
          {
            "date": "20240101",
            "title": "标题",
            "copyright": "葡萄风信子和郁金香，库肯霍夫公园，荷兰利瑟",
            "image_url": "https://www.bing.com/th?id=OHR.xxx_UHD.jpg",
            "description": null
          }
        ]
      }
    }
  },
  "market_time_config": {
    "zh-CN": { "start_ym": "201002", "end_ym": "202605" }
  }
}
```

## 目录结构

```
├── src/index.js           # Worker 代码
├── public/
│   ├── index.html         # 首页
│   ├── admin/             # 管理面板
│   └── static/            # 静态资源（样式、画廊脚本、市场元数据）
├── .github/workflows/     # GitHub Actions
├── wrangler.toml          # Worker 配置
└── README.md
```

## 配置

```toml
[triggers]
crons = ["5 4/12 * * *"]  # 每天 UTC 04:05 与 16:05 自动更新
```

## 数据存储

- 月度数据：`bing_YYYYMM` 键存储当月所有市场数据
- 年度归档：`archive_YYYY` 键存储已归档年份数据
- 市场配置：`market_time_config` 键存储各市场起止时间
- 月份索引：`market_index` 键缓存各市场有数据的月份与条数（派生数据，写操作后自动重建）
- 临时数据：`temp_<market>` 键存储最近一次抓取结果，用于次日校验补偿

## 性能优化

- **首屏只注入索引**：首页 HTML 仅内联月份索引（约 14KB），不再内联全量数据
- **按月按需加载**：优先加载视口附近的月份，其余在浏览器空闲时逐月预取
- **剔除冗余字段**：列表接口默认不含 `description`，单月请求仅几 KB
- **懒加载**：图片只在进入视口时加载
- **年度归档**：自动归档历史数据，减少运行时数据量

## License

MIT
