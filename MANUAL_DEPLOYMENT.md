# GitHub手动推送部署指南

本指南详细介绍如何通过GitHub手动推送代码来触发Bing Image Worker到Cloudflare Workers的部署流程。

## 准备工作
- 拥有GitHub账号
- 拥有Cloudflare账号
- 已创建Cloudflare R2存储桶
- 本地安装了Git和Node.js

## 步骤1: 克隆代码库
1. 打开终端/命令提示符
2. 克隆GitHub仓库到本地:
   ```bash
   git clone https://github.com/your-username/your-repo-name.git
   cd your-repo-name
   ```

## 步骤2: 安装依赖和配置Wrangler
1. 安装Wrangler CLI（如果尚未安装）:
   ```bash
   npm install -g wrangler
   ```

2. 登录Cloudflare账号:
   ```bash
   wrangler login
   ```
   这将打开浏览器，要求你授权Wrangler访问你的Cloudflare账号。

3. 确认wrangler.toml配置:
   - 确保`name`字段设置为你想要的Worker名称
   - 确保R2存储桶绑定配置正确:
     ```toml
     [r2_buckets]
     binding = "R2_BUCKET"
     bucket_name = "bing"
     ```

## 步骤3: 通过GitHub推送触发部署
1. 在本地进行测试（可选但推荐）:
   ```bash
   wrangler dev
   ```
   这将启动本地开发服务器，你可以测试Worker功能是否正常。

2. 提交代码更改:
   ```bash
   # 查看更改
   git status
   
   # 添加更改到暂存区
   git add .
   
   # 提交更改
   git commit -m "描述你的更改"
   ```

3. 推送到GitHub:
   ```bash
   git push origin main
   ```
   这将把你的代码推送到GitHub仓库的main分支。

4. 触发自动部署:
   - 推送代码后，GitHub Actions将自动触发部署工作流
   - 可以在GitHub仓库的"Actions"标签页查看部署进度

5. 部署成功后:
   - GitHub Actions会显示成功状态
   - 你可以在Cloudflare Workers控制台中找到更新后的Worker URL
   ```
   https://bing-image-worker.your-account.workers.dev
   ```

## 步骤4: 验证部署
1. 访问部署后的Worker URL
2. 检查是否返回包含Bing图片信息的JSON响应:
   ```json
   {
     "success": true,
     "imageUrl": "https://cn.bing.com/..._UHD.jpg",
     "r2Saved": true
   }
   ```
3. 登录Cloudflare控制台，在Workers仪表板中确认Worker已成功部署
4. 检查R2存储桶，确认图片已成功保存

## 通过GitHub推送部署的优势
- 触发自动化工作流，减少手动操作
- 代码变更与部署同步，便于追踪
- 可以在GitHub界面查看部署历史和日志
- 多人协作时自动部署确保代码一致性

## 故障排除
1. 如果部署失败，检查以下几点:
   - Cloudflare账号是否有足够权限
   - wrangler.toml配置是否正确
   - 网络连接是否正常
   - R2存储桶是否存在且配置正确

2. 查看详细错误信息:
   ```bash
   wrangler publish --verbose
   ```

3. 检查Cloudflare Workers日志:
   - 登录Cloudflare控制台
   - 导航到Workers仪表板
   - 选择你的Worker
   - 点击"Logs"标签查看详细日志

## 注意事项
- 确保你的代码包含所有必要的依赖和配置
- 定期备份你的代码和配置
- 部署前最好在本地进行充分测试
- 确保R2存储桶名称与wrangler.toml中配置的一致
- 首次部署可能需要在Cloudflare控制台中确认一些设置