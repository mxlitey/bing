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

## 步骤2: 安装依赖和配置

### 配置Worker入口点
在项目根目录下的`wrangler.toml`文件中，需要添加`main`字段来指定Worker脚本的入口点。例如：

```toml
main = "bing.js"
```

这告诉Wrangler CLI要部署的Worker脚本文件是`bing.js`。确保该文件存在于项目根目录中，并且包含正确的Worker代码。
1. 安装Wrangler CLI（如果尚未安装）:
   ```bash
   npm install -g wrangler
   ```

3. 配置Cloudflare API令牌:
   - 登录Cloudflare控制台
   - 转到[API令牌](https://dash.cloudflare.com/profile/api-tokens)页面
   - 创建一个具有以下权限的API令牌：
     - Workers KV Storage: Edit
     - Workers Scripts: Edit
     - R2 Admin: Edit
   - 复制生成的API令牌
   - 在GitHub仓库中配置 secrets：
     - 转到仓库的`Settings > Secrets and variables > Actions`
     - 点击`New repository secret`
     - 名称填入`CLOUDFLARE_API_TOKEN`
     - 值填入复制的Cloudflare API令牌
     - 点击`Add secret`


## 步骤3: 通过GitHub推送触发部署
1. 在本地进行测试（可选但推荐）:
   ```bash
   # 登录Cloudflare（仅本地测试需要）
   wrangler login
   
   # 启动本地开发服务器
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

## 故障排除
### 问题：图片保存到R2存储桶中没有.jpg后缀
**原因**：在代码中生成文件名时没有添加.jpg扩展名。

**解决方案**：
1. 打开<mcfile name="bing.js" path="c:\Users\czg95\Desktop\bing\bing.js"></mcfile>文件
2. 找到以下代码行：
   ```javascript
   // 格式化日期并生成文件名
   fileName = formatDate(data.images[0].enddate);
   ```
3. 修改为：
   ```javascript
   // 格式化日期并生成文件名（添加.jpg后缀）
   fileName = formatDate(data.images[0].enddate) + '.jpg';
   ```
4. 提交并推送更改到GitHub

这个修复确保了保存到R2存储桶的图片文件有正确的.jpg扩展名。

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