import requests
import re
import os
from datetime import datetime, timedelta

# 生成2021-02至2025-08期间的所有月份
def generate_month_list(start_year, start_month, end_year, end_month):
    months = []
    current_date = datetime(start_year, start_month, 1)
    end_date = datetime(end_year, end_month, 1)
    while current_date <= end_date:
        months.append(current_date.strftime('%Y-%m'))
        # 增加一个月
        if current_date.month == 12:
            current_date = datetime(current_date.year + 1, 1, 1)
        else:
            current_date = datetime(current_date.year, current_date.month + 1, 1)
    return months

# 发送请求并获取数据的函数
def get_data_from_url(url):
    try:
        response = requests.get(url)
        response.raise_for_status()  # 检查请求是否成功
        return response.text
    except requests.exceptions.RequestException as e:
        return f'请求出错: {e}'

# 下载图片并按年月分类保存的函数
def download_image(date, url):
    try:
        # 解析日期获取年月
        year_month = date[:7]  # 格式为 YYYY-MM
        # 创建年月文件夹
        os.makedirs(year_month, exist_ok=True)
        # 文件名就是日期
        filename = f'{date}.jpg'
        # 完整保存路径
        save_path = os.path.join(year_month, filename)
        
        # 检查文件是否已存在
        if os.path.exists(save_path):
            print(f'文件已存在，跳过下载: {save_path}')
            return True
        
        # 发送请求下载图片
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        # 保存图片
        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f'已下载: {save_path}')
        return True
    except Exception as e:
        print(f'下载失败 {date}: {e}')
        return False

# 提取日期和对应的4K下载链接的函数
def extract_date_link_pairs(data):
    # 匹配日期和对应4K下载链接的正则表达式
    # 修改正则表达式以匹配2021年及之后的日期
    # 匹配图片标签中的链接和后面的日期
    # 只提取到UHD.jpg为止的链接部分
    pattern = r'\|\!\[\]\((https://cn\.bing\.com/th\?id=.*?UHD\.jpg)(?:&.*?)?\)(202[1-9]-\d{2}-\d{2})\s*\[download 4k\]'    
    # 提取时只保留UHD.jpg前面的部分
    # 使用非捕获组(?:&.*?)?匹配可选的参数部分，但不会包含在捕获结果中
    # 查找所有匹配项
    matches = re.findall(pattern, data)
    # 为了测试，添加打印匹配结果的代码
    print(f'匹配到 {len(matches)} 个结果')
    # 创建字典，以日期为键，链接为值
    # 注意交换链接和日期的位置，因为正则表达式匹配的顺序是先链接后日期
    # 利用字典的特性自动去重，保留每个日期的最后一个匹配项
    date_link_dict = {date: link for link, date in matches}
    return date_link_dict

# 生成2021-02至2025-08的月份列表
months = generate_month_list(2021, 2, 2025, 8)
print(f'共需获取 {len(months)} 个月的数据')

# 初始化一个空字典来存储所有月份的数据
all_date_link_dict = {}

# 遍历所有月份
for month in months:
    print(f'正在获取 {month} 的数据...')
    # 构建当月的URL
    url = f'https://raw.githubusercontent.com/niumoo/bing-wallpaper/refs/heads/main/picture/{month}/README.md'
    # 获取数据
    raw_data = get_data_from_url(url)
    # 提取日期和链接对
    date_link_dict = extract_date_link_pairs(raw_data)
    # 将当月数据添加到总字典中
    all_date_link_dict.update(date_link_dict)
    print(f'{month} 数据获取完成，新增 {len(date_link_dict)} 条记录')

# 总数据量
print(f'所有数据获取完成，共 {len(all_date_link_dict)} 条记录')

# 开始下载所有图片
print('开始下载图片...')
success_count = 0
fail_count = 0

for date in sorted(all_date_link_dict.keys()):
    url = all_date_link_dict[date]
    if download_image(date, url):
        success_count += 1
    else:
        fail_count += 1

print(f'下载完成: 成功 {success_count} 张, 失败 {fail_count} 张')

# 将结果写入文件
with open('bing_4k_links.txt', 'w', encoding='utf-8') as f:
    f.write('日期与4K下载链接对应关系:\n')
    # 按日期排序
    for date in sorted(all_date_link_dict.keys()):
        f.write(f'{date}: {all_date_link_dict[date]}\n')
print('结果已写入 bing_4k_links.txt 文件')