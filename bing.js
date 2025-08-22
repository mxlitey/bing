// Bing 图片 API URL
const API_URL = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1';

/**
 * 从 Bing 图片 API 获取数据
 * @returns {Promise<Object>} 包含 Bing 图片信息的对象
 */
async function getBingImageData() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`获取数据失败: ${error.message}`);
    throw error;
  }
}

/**
 * 格式化日期：将YYYYMMDD转换为YYYY-MM-DD并加1天
 * @param {string} enddate - 格式为YYYYMMDD的日期字符串
 * @returns {string} 格式为YYYY-MM-DD的日期字符串
 */
function formatDate(enddate) {
  // 解析日期
  const year = parseInt(enddate.substring(0, 4));
  const month = parseInt(enddate.substring(4, 6)) - 1; // 月份从0开始
  const day = parseInt(enddate.substring(6, 8));
  
  // 创建日期对象并加1天
  const date = new Date(year, month, day);
  date.setDate(date.getDate() + 1);
  
  // 格式化日期为YYYY-MM-DD
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 下载图片并保存到Cloudflare R2
 * @param {string} imageUrl - 图片URL
 * @param {string} fileName - 保存到R2的文件名
 * @param {Object} env - Cloudflare Workers环境对象，包含R2存储桶绑定
 * @returns {Promise<void>} 保存成功后解析
 */
async function saveImageToR2(imageUrl, fileName, env) {
  try {
    // 下载图片
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`下载图片失败: ${response.status}`);
    }
    
    // 获取图片二进制数据
    const imageData = await response.arrayBuffer();
    
    // 上传图片到R2存储桶
    await env.R2_BUCKET.put(fileName, imageData);
    
    console.log(`图片已成功保存到R2: ${fileName}`);
  } catch (error) {
    console.error(`保存图片到R2失败: ${error.message}`);
    throw error;
  }
}

/**
 * Cloudflare Worker 入口函数
 */
async function handleRequest(request, env) {
  try {
    const data = await getBingImageData();
    
    // 提取图片 URL 和 enddate
    let imageUrl = null;
    let fileName = null;
    if (data.images && data.images.length > 0) {
      // 使用urlbase拼接UHD格式图片URL
      imageUrl = `https://cn.bing.com${data.images[0].urlbase}_UHD.jpg`;
      
      // 格式化日期并生成文件名
      fileName = formatDate(data.images[0].enddate);
    }
    
    // 下载并保存图片到R2
    if (imageUrl && fileName) {
      await saveImageToR2(imageUrl, fileName, env);
    }
    
    // 确定图片是否成功保存到R2
    const r2Saved = !!fileName;  // 如果fileName存在，表示保存成功

    // 返回 JSON 响应
    return new Response(JSON.stringify({
      success: true,
      imageUrl: imageUrl,
      r2Saved: r2Saved
    }), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
      },
    });
  }
}

// 导出 Cloudflare Worker 处理函数
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request, event.env));
});

// 导出默认对象以支持模块格式
export default {
  fetch: handleRequest
};

// 开发环境测试代码
// 注意：在本地测试时，需要模拟env对象
if (typeof window !== 'undefined') {
  // 在浏览器环境中运行测试
  (async function() {
    try {
      const data = await getBingImageData();
      console.log('Bing 图片数据:', data);
      if (data.images && data.images.length > 0) {
        const imageUrl = `https://cn.bing.com${data.images[0].urlbase}_UHD.jpg`;
        console.log('图片 URL:', imageUrl);
      }
    } catch (error) {
      console.error('错误:', error.message);
    }
  })();
}