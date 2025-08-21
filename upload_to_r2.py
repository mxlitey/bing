import os
import re
import boto3
from botocore.client import Config
import json
from tqdm import tqdm

# 配置文件路径
CONFIG_FILE = 'r2_config.json'

# 加载配置
def load_config():
    if not os.path.exists(CONFIG_FILE):
        print(f'配置文件 {CONFIG_FILE} 不存在，请先创建该文件。')
        print('配置文件格式示例:')
        print('{')
        print('  "access_key_id": "你的R2访问密钥ID",')
        print('  "secret_access_key": "你的R2秘密访问密钥",')
        print('  "endpoint_url": "你的R2端点URL",')
        print('  "bucket_name": "你的存储桶名称",')
        print('  "region_name": "auto"')
        print('}')
        exit(1)
    
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

# 初始化R2客户端
def init_r2_client(config):
    # 确保endpoint_url不包含存储桶名称
    endpoint_url = config['endpoint_url'].rstrip('/')
    if '/' in endpoint_url:
        endpoint_url = endpoint_url.split('/', 3)[0] + '//' + endpoint_url.split('/', 3)[2]
        
    return boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=config['access_key_id'],
        aws_secret_access_key=config['secret_access_key'],
        region_name=config['region_name'],
        config=Config(signature_version='s3v4')
    )

# 上传单个文件到R2
def upload_file_to_r2(client, file_path, bucket_name, object_name):
    try:
        # 检查文件是否已存在于R2存储桶
        try:
            client.head_object(Bucket=bucket_name, Key=object_name)
            print(f'文件已存在于R2存储桶，跳过上传: {object_name}')
            return True
        except client.exceptions.ClientError as e:
            # 如果文件不存在，继续上传
            if e.response['Error']['Code'] == '404':
                # 上传文件
                client.upload_file(file_path, bucket_name, object_name)
                print(f'已上传: {file_path} -> {object_name}')
                return True
            else:
                # 其他错误
                print(f'检查文件是否存在时出错: {e}')
                return False
    except Exception as e:
        print(f'上传失败 {file_path}: {e}')
        return False

# 遍历文件夹并上传所有图片
def upload_images_to_r2(root_dir, client, bucket_name):
    try:
        # 递归获取所有jpg图片
        image_files = []
        for root, dirs, files in os.walk(root_dir):
            for file in files:
                if file.lower().endswith('.jpg'):
                    image_files.append(os.path.join(root, file))
        
        total_images = len(image_files)
        print(f'找到 {total_images} 张图片')
        
        success_count = 0
        fail_count = 0
        
        # 遍历上传每个图片
        with tqdm(total=total_images, desc='上传图片') as pbar:
            for file_path in image_files:
                # 只使用文件名作为对象名称
                image_file = os.path.basename(file_path)
                object_name = image_file
                
                if upload_file_to_r2(client, file_path, bucket_name, object_name):
                    success_count += 1
                else:
                    fail_count += 1
                
                pbar.update(1)
        
        print(f'上传完成: 总计 {total_images} 张, 成功 {success_count} 张, 失败 {fail_count} 张')
        return success_count, fail_count
    except Exception as e:
        print(f'上传图片时出错: {e}')
        return 0, 0

if __name__ == '__main__':
    # 加载配置
    config = load_config()
    
    # 初始化R2客户端
    r2_client = init_r2_client(config)
    
    # 上传图片
    print('开始上传图片到Cloudflare R2...')
    success, fail = upload_images_to_r2(os.getcwd(), r2_client, config['bucket_name'])
    
    # 打印上传结果
    print(f'上传完成: 成功 {success} 张, 失败 {fail} 张')

# 注意事项:
# 1. 请确保已安装必要的依赖: pip install boto3 botocore tqdm
# 2. 请在运行前创建并配置 r2_config.json 文件
# 3. 代码会自动遍历当前目录下所有符合 YYYY-MM 格式的文件夹
# 4. 图片将按照 年月/日期.jpg 的结构上传到R2存储桶