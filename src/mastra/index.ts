// 这是一个完整的Cloudflare Worker示例，用于解决你的CORS问题
// 将这段代码保存为index.js并部署到你的Cloudflare Worker

import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { codeReviewAgent } from './agents';

// 定义允许的域名
const allowedOrigins = [
  'https://deepseek-pages-demo.pages.dev',
  'https://zhaoyangkuajing.cyou',
  'http://localhost:3000',
  'http://localhost:5173'
];

// 创建Mastra实例
export const mastra = new Mastra({
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});

// 处理CORS的函数
function handleCors(request) {
  const origin = request.headers.get('Origin');
  const isAllowedOrigin = origin && allowedOrigins.includes(origin);

  // 如果是预检请求(OPTIONS)
  if (request.method === 'OPTIONS') {
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Development',
      'Access-Control-Max-Age': '86400',
    };

    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return null; // 不是预检请求，继续正常处理
}

// 处理API请求的函数
async function handleApiRequest(request) {
  try {
    // 使用Mastra处理请求
    const response = await mastra.handleRequest(request);

    // 获取请求的源
    const origin = request.headers.get('Origin');
    const isAllowedOrigin = origin && allowedOrigins.includes(origin);

    // 复制原始响应并添加CORS头
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Development',
    };

    // 从原始响应中获取所有头部
    const responseHeaders = new Headers(response.headers);

    // 添加CORS头
    Object.entries(corsHeaders).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    // 返回带有CORS头的新响应
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    // 错误处理
    console.error('API请求处理错误:', error);

    // 获取请求的源
    const origin = request.headers.get('Origin');
    const isAllowedOrigin = origin && allowedOrigins.includes(origin);

    // 返回错误响应，同时添加CORS头
    return new Response(JSON.stringify({ error: error.message || '内部服务器错误' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Development',
      }
    });
  }
}

// Cloudflare Worker入口点
addEventListener('fetch', event => {
  const request = event.request;

  // 首先检查是否是CORS预检请求
  const corsResponse = handleCors(request);
  if (corsResponse) {
    event.respondWith(corsResponse);
    return;
  }

  // 处理实际的API请求
  event.respondWith(handleApiRequest(request));
});
