# Bing Wallpaper Worker

自动获取 Bing 每日壁纸信息并存储到 Cloudflare KV 的边缘函数，支持 Web 管理面板。

## 功能

- 每天 UTC 0点自动获取 Bing 壁纸信息（zh-CN）
- 数据按月存储到 Cloudflare KV
- Web 管理面板：导入、导出、删除数据
- Token 认证保护管理操作

## 部署

### GitHub Actions 自动部署（推荐）

**1. Fork 本仓库**

**2. 创建 Cloudflare API Token**

前往 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)，点击 `Create Token`，选择 `Edit Cloudflare Workers` 模板，确认创建。

**3. 配置 GitHub Secrets**

在 Fork 的仓库中，进入 `Settings > Secrets and variables > Actions`，添加：

| Name | Value |
|------|-------|
| `CLOUDFLARE_API_TOKEN` | 上一步创建的 API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（在 Workers 页面右侧可找到） |
| `AUTH_TOKEN` | 管理面板认证密码（自定义，用于登录管理面板） |

**4. 启用 GitHub Actions**

进入仓库的 `Actions` 页面，启用 Workflow。

**5. 触发部署**

推送到 `main` 分支即可自动部署。GitHub Actions 会自动创建 KV 命名空间并配置认证 Token。

---

### 命令行部署

**1. 安装 Wrangler**

```bash
npm install -g wrangler
```

**2. 登录 Cloudflare**

```bash
wrangler login
```

**3. 创建 KV 命名空间**

```bash
wrangler kv:namespace create BING_KV
```

输出示例：
```
{ binding = "BING_KV", id = "xxxx..." }
```

**4. 配置 wrangler.toml**

```toml
[vars]
AUTH_TOKEN = "你的私密密码"

[[kv_namespaces]]
binding = "BING_KV"
id = "你的KV命名空间ID"
```

**5. 部署**

```bash
wrangler deploy
```

---

## 使用

部署成功后，访问 `https://your-worker.your-subdomain.workers.dev` 打开管理面板。

### 认证说明

- 访问管理面板需要输入 `AUTH_TOKEN` 进行认证
- Token 存储在浏览器 localStorage 中，关闭浏览器后仍有效
- 点击「退出」按钮可清除登录状态

### API 端点

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/` | GET | ❌ | 管理面板页面 |
| `/json` | GET | ❌ | 获取所有数据 |
| `/YYYYMM` | GET | ❌ | 获取指定月份（如 `/202605`） |
| `/YYYYMMDD` | GET | ❌ | 获取指定日期（如 `/20260501`） |
| `/api/stats` | GET | ❌ | 统计信息 |
| `/api/months` | GET | ❌ | 月份列表 |
| `/api/export` | GET | ❌ | 导出数据 |
| `/api/login` | POST | ❌ | 登录认证 |
| `/api/update` | GET | ✅ | 手动更新 |
| `/api/import` | POST | ✅ | 导入数据 |
| `/api/delete-month` | POST | ✅ | 删除月份 |

### 数据格式

```json
{
  "date": "20260501",
  "copyright": "葡萄风信子和郁金香，库肯霍夫公园，荷兰利瑟 (© Achim Thomae/Getty Images)",
  "url": "https://cn.bing.com/th?id=OHR.TulipsKeukenhof_ZH-CN7554485395_UHD.jpg"
}
```

### 字段过滤

所有数据端点支持 `fields` 参数，只返回指定字段：

```bash
# 只返回 url 字段
/json?fields=url

# 只返回 date 和 url 字段
/202605?fields=date,url

# 只返回 copyright 字段
/20260501?fields=copyright
```

**响应示例：**
```json
// /20260501?fields=url
{
  "url": "https://cn.bing.com/th?id=OHR.TulipsKeukenhof_ZH-CN7554485395_UHD.jpg"
}

// /json?fields=date,url
[
  { "date": "20260501", "url": "https://..." },
  { "date": "20260430", "url": "https://..." }
]
```

### KV 存储结构

```
键            值
bing_202605  [{"date":"20260501",...}]
bing_202604  [{"date":"20260401",...}]
```

---

## 目录结构

```
├── src/
│   └── index.js          # Worker 代码
├── public/
│   ├── index.html        # 管理面板
│   ├── style.css         # 样式
│   └── app.js            # 前端脚本
├── .github/
│   └── workflows/
│       └── deploy.yml    # 自动部署
├── wrangler.toml         # Worker 配置
└── README.md
```

---

## 定时任务

默认每天 UTC 0点（北京时间 8点）自动执行。修改 `wrangler.toml`：

```toml
[triggers]
crons = ["0 0 * * *"]
```
