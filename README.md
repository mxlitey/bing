# Bing Wallpaper

基于 Cloudflare Workers + Assets 的 Bing 壁纸画廊，自动获取每日壁纸。

## 功能

- 每天 UTC 16:05（北京时间 00:05）自动获取 Bing 壁纸
- 服务端渲染首屏，优化 LCP 性能
- 时间线导航，快速跳转到年份/月份
- 响应式设计，支持手机和电脑
- 懒加载优化，只加载可见区域图片
- 管理面板：导入、导出、删除数据
- 树形数据管理，支持按年/月/日删除
- Token 认证保护管理操作
- 两种主题：樱花粉、深邃黑
- 边缘缓存 1 年，浏览器缓存 30 天

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

**4. （可选）配置 Bing 市场**

如需使用其他市场的壁纸，可在 `Settings > Secrets and variables > Actions > Variables` 中添加：

| Name       | Value                      |
| ---------- | -------------------------- |
| `BING_API` | 选择下表中的 API 链接        |

### Bing 壁纸市场列表

不同市场的 Bing 壁纸 API 链接：

| 市场     | 地区         | API 链接                                                      |
| -------- | ------------ | ------------------------------------------------------------ |
| zh-CN    | 中国大陆     | `https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN` |
| zh-HK    | 中国香港     | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-HK` |
| zh-TW    | 中国台湾     | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-TW` |
| en-US    | 美国         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US` |
| en-GB    | 英国         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-GB` |
| ja-JP    | 日本         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ja-JP` |
| ko-KR    | 韩国         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ko-KR` |
| de-DE    | 德国         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=de-DE` |
| fr-FR    | 法国         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=fr-FR` |
| it-IT    | 意大利       | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=it-IT` |
| es-ES    | 西班牙       | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=es-ES` |
| pt-BR    | 巴西         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=pt-BR` |
| ru-RU    | 俄罗斯       | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ru-RU` |
| en-AU    | 澳大利亚     | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-AU` |
| en-CA    | 加拿大       | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-CA` |
| en-IN    | 印度         | `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-IN` |

**5. 推送代码**

推送到 `main` 分支即可自动部署。

## 使用

部署成功后：

- **首页**：`https://bing.<子域>.workers.dev/` - 壁纸画廊
- **管理面板**：`https://bing.<子域>.workers.dev/admin/` - 数据管理

## API

### 公开接口

| 端点         | 方法   | 说明                                              |
| ------------ | ------ | ------------------------------------------------- |
| `/json`      | GET    | 获取所有壁纸数据，返回数组 `[{ date, url, copyright }]` |
| `/api/login` | POST   | 登录认证，Body: `{ "token": "xxx" }`              |

### 认证接口（需要 Token）

请求头添加 `Authorization: Bearer <token>`

| 端点          | 方法   | 说明                                       |
| ------------- | ------ | ------------------------------------------ |
| `/update`     | GET    | 手动更新，从 Bing API 获取最新壁纸          |
| `/api/import` | POST   | 导入数据，Body: `[{ date, url, copyright }]` |
| `/api/delete` | POST   | 删除数据，支持按年/月/日删除                |

### 删除接口参数

`/api/delete` 支持三种粒度：

```json
{ "year": "2025" }      // 删除整年
{ "month": "202505" }   // 删除整月
{ "date": "20250501" }  // 删除单日
```

### 字段过滤

```bash
/json?fields=date,url
```

### 数据格式

```json
{
  "date": "20260501",
  "copyright": "葡萄风信子和郁金香，库肯霍夫公园，荷兰利瑟",
  "url": "https://cn.bing.com/th?id=OHR.TulipsKeukenhof_ZH-CN7554485395_UHD.jpg"
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

## 性能优化

- **服务端渲染**：首屏 HTML 直接包含壁纸数据，无需等待 JS 加载
- **内联关键 CSS**：Hero 区域样式内联到 `<head>`，消除阻塞渲染
- **动态预连接**：根据图片 URL 自动注入预连接，支持不同市场
- **懒加载**：图片只在进入视口时加载
- **缓存策略**：静态资源边缘缓存 1 年，浏览器缓存 30 天

## License

MIT
