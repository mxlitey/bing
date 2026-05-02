# Bing Wallpaper

基于 Cloudflare Workers + Assets 的 Bing 壁纸画廊，自动获取每日壁纸。

## 功能

- 每天 UTC 0点自动获取 Bing 壁纸（zh-CN）
- 时间线导航，快速跳转到年份/月份
- 响应式设计，支持手机和电脑
- 懒加载优化，只加载可见区域图片
- 管理面板：导入、导出、删除数据
- Token 认证保护管理操作
- 四种主题：樱花、海洋、森林、暗黑

## 部署

### GitHub Actions 自动部署

**1. Fork 本仓库**

**2. 创建 Cloudflare API Token**

前往 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)，点击 `Create Token`，选择 `Edit Cloudflare Workers` 模板。

**3. 配置 GitHub Secrets**

在 Fork 的仓库中，进入 `Settings > Secrets and variables > Actions`，添加：

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | 上一步创建的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `AUTH_TOKEN` | 管理面板认证密码 |

**4. 推送代码**

推送到 `main` 分支即可自动部署。

## 使用

部署成功后：

- **首页**：`https://bing.<子域>.workers.dev/` - 壁纸画廊
- **管理面板**：`https://bing.<子域>.workers.dev/admin/` - 数据管理

## API

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/json` | GET | ❌ | 获取所有数据 |
| `/api/years` | GET | ❌ | 年份列表 |
| `/api/latest` | GET | ❌ | 最新壁纸 |
| `/api/month/YYYYMM` | GET | ❌ | 指定月份数据 |
| `/api/stats` | GET | ❌ | 统计信息 |
| `/api/export` | GET | ❌ | 导出数据 |
| `/api/login` | POST | ❌ | 登录认证 |
| `/update` | GET | ✅ | 手动更新 |
| `/api/import` | POST | ✅ | 导入数据 |
| `/api/delete-month` | POST | ✅ | 删除月份 |

### 字段过滤

```bash
/json?fields=date,url
/api/month/202605?fields=copyright
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
│   ├── admin/             # 管理面板
│   └── static/            # 静态资源
├── .github/workflows/     # GitHub Actions
├── wrangler.toml          # Worker 配置
└── README.md
```

## 配置

```toml
[triggers]
crons = ["0 0 * * *"]  # 每天 UTC 0点自动更新
```

## License

MIT
