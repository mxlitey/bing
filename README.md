# Bing Wallpaper

基于 Cloudflare Workers + Assets 的 Bing 壁纸画廊，自动获取每日壁纸。

## 功能

- 每天 UTC 16:05（北京时间 00:05）自动获取多个市场的 Bing 壁纸
- 支持 13 个市场：中国、美国、英国、德国、法国、日本、加拿大、印度、西班牙、意大利、巴西等
- 首页市场切换，一键查看不同地区壁纸
- 时间线导航，快速跳转到年份/月份
- 响应式设计，支持手机和电脑
- 懒加载优化，只加载可见区域图片
- 管理面板：导入、导出、删除数据
- 树形数据管理，支持按市场/年/月/日删除
- 年度自动归档，节省存储空间
- Token 认证保护管理操作
- 边缘缓存，浏览器缓存 30 天

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
| `/json`      | GET    | 获取最近 2 个月的壁纸数据                          |
| `/json?all=1`| GET    | 获取所有壁纸数据                                   |
| `/api/login` | POST   | 登录认证，Body: `{ "token": "xxx" }`              |

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
│   ├── _headers           # 缓存配置
│   ├── admin/             # 管理面板
│   └── static/            # 静态资源
├── .github/workflows/     # GitHub Actions
├── wrangler.toml          # Worker 配置
└── README.md
```

## 配置

```toml
[triggers]
crons = ["5 16 * * *"]  # 每天 UTC 16:05（北京时间 00:05）自动更新
```

## 数据存储

- 月度数据：`bing_YYYYMM` 键存储当月所有市场数据
- 年度归档：`archive_YYYY` 键存储已归档年份数据
- 市场配置：`market_time_config` 键存储各市场起止时间
- 缓存：`cache_all_data` 键缓存全量数据（24小时过期）

## 性能优化

- **服务端渲染**：首屏 HTML 直接包含壁纸数据，无需等待 JS 加载
- **首屏优化**：优先加载最近 2 个月数据，后台异步加载全量数据
- **内联关键 CSS**：Hero 区域样式内联到 `<head>`，消除阻塞渲染
- **懒加载**：图片只在进入视口时加载
- **缓存策略**：静态资源边缘缓存 1 年，浏览器缓存 30 天
- **年度归档**：自动归档历史数据，减少运行时数据量

## License

MIT
