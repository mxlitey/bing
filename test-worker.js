// Cloudflare Workers 本地测试模拟脚本

// 模拟 R2 存储桶
class MockR2Bucket {
  constructor() {
    this.files = new Map();
  }

  async put(key, data) {
    this.files.set(key, data);
    console.log(`模拟保存文件到R2: ${key}`);
    return { success: true };
  }

  async get(key) {
    return this.files.get(key) || null;
  }
}

// 模拟环境对象
const mockEnv = {
  R2_BUCKET: new MockR2Bucket()
};

// 模拟请求对象
const mockRequest = new Request('http://localhost:8787/');

// 导入并执行 Worker 代码
(async () => {
  try {
    // 读取并评估 bing.js 文件
    const response = await fetch('file:///C:/Users/czg95/Desktop/bing/bing.js');
    const code = await response.text();

    // 创建一个沙箱环境
    const sandbox = {
      fetch: window.fetch,
      console: console,
      addEventListener: () => {},
      Response: Response,
      Request: Request,
      URL: URL
    };

    // 执行代码
    const workerModule = {};
    const require = () => {};
    eval(code);

    // 获取导出的 fetch 函数
    const handleRequest = workerModule.exports?.fetch || self.handleRequest;

    if (typeof handleRequest !== 'function') {
      throw new Error('无法找到 handleRequest 函数');
    }

    // 执行请求处理
    console.log('开始测试 Worker...');
    const result = await handleRequest(mockRequest, mockEnv);
    const data = await result.json();

    console.log('测试结果:', data);
    console.log('测试完成');
  } catch (error) {
    console.error('测试失败:', error);
  }
})();

// 注意：此脚本需要在浏览器中运行，或者使用支持 fetch API 的环境
// 使用方法：在浏览器中打开一个空白页面，将此脚本粘贴到控制台执行