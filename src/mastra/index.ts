import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { codeReviewAgent } from './agents';

// 定义允许的域名列表
const allowedOrigins = [
  'https://deepseek-pages-demo.pages.dev',
  'https://zhaoyangkuajing.cyou',
  // 开发环境
  'http://localhost:3000',
  'http://localhost:5173',
  // 添加其他你可能需要的域名
];

export const mastra = new Mastra({
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    cors: {
      origin: (origin) => {
        // 如果请求没有origin（如服务器对服务器的请求）或者origin在允许列表中，则允许
        return !origin || allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Development'],
      exposeHeaders: ['Content-Length', 'X-Content-Type-Options'],
      credentials: true, // 如果需要发送cookies等凭证，设为true
      maxAge: 86400, // 预检请求结果缓存1天
    },
  },
});

// 为了确保CORS正确工作，添加一个请求处理的拦截器
mastra.use(async (ctx, next) => {
  // 获取请求的源
  const origin = ctx.request.headers.get('Origin');

  // 如果是预检请求或者源在允许列表中
  if (ctx.request.method === 'OPTIONS' || !origin || allowedOrigins.includes(origin)) {
    // 添加CORS头
    ctx.response.headers.set('Access-Control-Allow-Origin', origin || '*');
    ctx.response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    ctx.response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Development');
    ctx.response.headers.set('Access-Control-Allow-Credentials', 'true');
    ctx.response.headers.set('Access-Control-Max-Age', '86400');

    // 如果是预检请求，直接返回成功
    if (ctx.request.method === 'OPTIONS') {
      ctx.response.status = 204;
      return;
    }
  }

  // 继续处理请求
  await next();
});
