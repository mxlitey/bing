import os
import json
import boto3
from botocore.client import Config
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

# 清空R2存储桶
def empty_r2_bucket(client, bucket_name):
    try:
        # 列出存储桶中的所有对象
        print(f'正在列出存储桶 {bucket_name} 中的所有对象...')
        objects = []
        continuation_token = None
        while True:
            if continuation_token:
                response = client.list_objects_v2(Bucket=bucket_name, ContinuationToken=continuation_token)
            else:
                response = client.list_objects_v2(Bucket=bucket_name)
            
            if 'Contents' in response:
                objects.extend(response['Contents'])
            
            if not response.get('IsTruncated', False):
                break
            
            continuation_token = response.get('NextContinuationToken')
        
        print(f'找到 {len(objects)} 个对象，准备删除...')
        
        # 批量删除对象（每次最多删除1000个）
        if len(objects) > 0:
            with tqdm(total=len(objects), desc='删除对象') as pbar:
                for i in range(0, len(objects), 1000):
                    batch = objects[i:i+1000]
                    delete_request = {'Objects': [{'Key': obj['Key']} for obj in batch]}
                    client.delete_objects(Bucket=bucket_name, Delete=delete_request)
                    pbar.update(len(batch))
            
            print(f'成功删除存储桶 {bucket_name} 中的所有对象')
        else:
            print(f'存储桶 {bucket_name} 已经是空的')
        
        return True
    except Exception as e:
        print(f'清空存储桶失败: {e}')
        return False

if __name__ == '__main__':
    # 加载配置
    config = load_config()
    
    # 初始化R2客户端
    r2_client = init_r2_client(config)
    
    # 清空存储桶
    print(f'开始清空R2存储桶: {config["bucket_name"]}')
    if empty_r2_bucket(r2_client, config['bucket_name']):
        print('操作完成')
    else:
        print('操作失败')

# 注意事项:
# 1. 请确保已安装必要的依赖: pip install boto3 botocore tqdm
# 2. 请在运行前创建并配置 r2_config.json 文件
# 3. 此脚本将删除指定存储桶中的所有对象，请谨慎使用
# 4. 脚本支持批量删除，每次最多删除1000个对象