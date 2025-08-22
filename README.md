# Bing Image Worker

一个将Bing每日图片保存到Cloudflare R2并提供UHD图片URL的Cloudflare Worker。

## 功能特点
- 从Bing图片API获取每日图片
- 生成UHD格式图片URL
- 将图片保存到Cloudflare R2存储桶
- 提供精简的JSON响应，包含图片URL和保存状态

## 部署指南（通过GitHub）

### 1. 准备工作
- 拥有GitHub账号
- 拥有Cloudflare账号
- 已创建Cloudflare R2存储桶

### 2. 创建GitHub仓库
1. 在GitHub上创建一个新仓库
2. 将本地代码推送到GitHub仓库：
   ```bash
   # 初始化Git仓库
   git init
   
   # 添加文件
   git add .
   
   # 提交代码
   git commit -m "Initial commit"
   
   # 关联远程仓库
   git remote add origin https://github.com/your-username/your-repo-name.git
   
   # 推送代码
   git push -u origin main
   ```

### 3. 配置Cloudflare API令牌
1. 登录Cloudflare控制台
2. 转到[API令牌](https://dash.cloudflare.com/profile/api-tokens)页面
3. 创建一个具有以下权限的API令牌：
   - Workers KV Storage: Edit
   - Workers Scripts: Edit
   - R2 Admin: Edit
4. 复制生成的API令牌
5. 在GitHub仓库中配置 secrets：
   - 转到仓库的`Settings > Secrets and variables > Actions`
   - 点击`New repository secret`
   - 名称填入`CLOUDFLARE_API_TOKEN`
   - 值填入复制的Cloudflare API令牌
   - 点击`Add secret`

### 4. 触发自动部署
1. 将代码推送到main分支后，GitHub Actions将自动触发部署
2. 可以在仓库的`Actions`标签页查看部署进度和日志

### 5. 访问Worker
部署成功后，在Cloudflare Workers控制台中可以找到Worker的URL
访问该URL将返回包含Bing图片信息的JSON响应

## 本地开发
1. 安装Wrangler CLI：
   ```bash
   npm install -g wrangler
   ```
2. 登录Cloudflare：
   ```bash
   wrangler login
   ```
3. 本地测试：
   ```bash
   wrangler dev
   ```
4. 手动部署：
   ```bash
   wrangler publish
   ```

## 响应格式
成功响应：
```json
{
  "success": true,
  "imageUrl": "https://cn.bing.com/..._UHD.jpg",
  "r2Saved": true
}
```

失败响应：
```json
{
  "success": false,
  "error": "错误信息"
}
```

## 注意事项
- 确保R2存储桶名称与wrangler.toml中配置的一致
- API令牌需要有足够的权限来部署Workers和访问R2
- 首次部署可能需要在Cloudflare控制台中确认一些设置