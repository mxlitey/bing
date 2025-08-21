# Bing壁纸下载与Cloudflare R2管理工具

这个项目包含多个脚本，用于下载Bing壁纸并管理Cloudflare R2存储桶中的图片：
1. `bing.py` - 从GitHub仓库获取Bing每日壁纸的4K下载链接，并下载图片
2. `upload_to_r2.py` - 将下载的图片上传到Cloudflare R2存储桶根目录
3. `empty_r2_bucket.py` - 清空Cloudflare R2存储桶中的所有对象
4. `move_r2_objects_to_root.py` - 将R2存储桶中年月文件夹的图片移动到根目录

## 功能说明

### bing.py
- 从指定GitHub仓库获取2021-02至2025-08期间的Bing壁纸4K下载链接
- 按年月创建文件夹，并将图片保存到对应目录，文件名格式为`YYYY-MM-DD.jpg`
- 检查文件是否已存在，若存在则跳过下载，避免重复下载
- 生成包含日期与下载链接对应关系的文本文件 `bing_4k_links.txt`

### upload_to_r2.py
- 递归遍历当前目录下所有`.jpg`图片文件
- 将图片直接上传到Cloudflare R2存储桶根目录，不创建年月文件夹
- 检查存储桶中文件是否已存在，若存在则跳过上传
- 提供上传进度和结果统计
- 包含错误处理机制，确保上传过程稳定

### empty_r2_bucket.py
- 清空指定Cloudflare R2存储桶中的所有对象
- 支持处理超过1000个对象的批量删除
- 提供删除进度和结果统计
- 包含确认机制，防止误操作

### move_r2_objects_to_root.py
- 将R2存储桶中年月文件夹(`YYYY-MM`)中的图片移动到根目录
- 支持匹配`YYYY-MM/YYYY-MM-DD.jpg`格式的文件路径
- 提供移动进度和结果统计
- 包含错误处理机制，遇到失败对象会跳过并记录

## 环境要求

- Python 3.6+ 
- 所需依赖包：
  - requests
  - boto3
  - botocore
  - tqdm
  - argparse

## 安装依赖

```bash
pip install requests boto3 botocore tqdm argparse
```

## 使用方法

### 1. 配置R2凭证

首先，编辑`r2_config.json`文件，填入你的Cloudflare R2凭证信息：
```json
{
  "access_key_id": "你的R2访问密钥ID",
  "secret_access_key": "你的R2秘密访问密钥",
  "endpoint_url": "你的R2端点URL",
  "bucket_name": "你的存储桶名称",
  "region_name": "auto"
}
```

### 2. 下载Bing壁纸

运行`bing.py`脚本：

```bash
python bing.py
```

脚本会自动获取链接并按年月创建文件夹，将图片保存到对应目录中，文件名格式为`YYYY-MM-DD.jpg`。如果文件已存在，则会跳过下载。

### 3. 上传到Cloudflare R2

运行上传脚本：

```bash
python upload_to_r2.py
```

脚本会递归遍历当前目录下所有`.jpg`图片文件，并将它们直接上传到R2存储桶根目录。如果存储桶中已存在同名文件，则会跳过上传。

### 4. 清空R2存储桶

运行清空脚本：

```bash
python empty_r2_bucket.py
```

脚本会提示你确认是否要清空存储桶，输入`yes`后开始删除操作。脚本会批量删除存储桶中的所有对象，并显示删除进度。

### 5. 将R2存储桶中的图片移动到根目录

运行移动脚本：

```bash
python move_r2_objects_to_root.py
```

脚本会查找存储桶中年月文件夹(`YYYY-MM`)中的图片，并将它们移动到存储桶根目录。移动过程中会显示进度，并记录任何移动失败的对象。

## 注意事项

1. 确保你有稳定的网络连接，特别是在下载大量图片时
2. 上传、删除或移动R2存储桶中的图片可能会产生流量费用，请留意你的Cloudflare账户情况
3. 请妥善保管你的R2凭证信息，不要分享给他人
4. 使用`empty_r2_bucket.py`脚本时请务必谨慎，它会删除存储桶中的所有对象
5. 所有脚本都包含错误处理机制，但遇到问题时仍请根据提示进行排查
6. 对于大型存储桶操作（如清空或移动大量对象），可能需要较长时间，请耐心等待

## 文件结构

```
bing-py/
├── 2021-02/
│   ├── 2021-02-01.jpg
│   ├── 2021-02-02.jpg
│   ├── ...
├── 2021-03/
│   ├── 2021-03-01.jpg
│   ├── 2021-03-02.jpg
│   ├── ...
├── ...
├── 2025-08/
│   ├── 2025-08-01.jpg
│   ├── 2025-08-02.jpg
│   ├── ...
├── bing.py
├── bing_4k_links.txt
├── upload_to_r2.py
├── empty_r2_bucket.py
├── move_r2_objects_to_root.py
├── r2_config.json
└── README.md
```

> 注意：虽然图片文件在本地文件系统中仍按年月文件夹组织，但`upload_to_r2.py`脚本会将它们直接上传到R2存储桶的根目录。