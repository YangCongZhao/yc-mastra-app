import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { CloudflareDeployer } from "@mastra/deployer-cloudflare";

import { codeReviewAgent } from './agents';

// 定义允许的域名
const ALLOWED_ORIGINS = [
  'https://deepseek-pages-demo.pages.dev',
  'https://zhaoyangkuajing.cyou',
];

// CORS 头
const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export const mastra = new Mastra({
  deployer: new CloudflareDeployer({
    scope: "d5b3bb970da79f07a9fb614e60d02766",
    projectName: "yc-mastra-app",
    routes: [
      {
        pattern: "deepseek-pages-demo.pages.dev/*",
        zone_name: "deepseek-pages-demo.pages.dev",
        custom_domain: false,
      },
      {
        pattern: "zhaoyangkuajing.cyou/*",
        zone_name: "zhaoyangkuajing.cyou",
        custom_domain: true,
      },
    ],
    workerNamespace: "3223a366bb61449b8eaa2981622663d9",
    auth: {
      apiToken: "UM7POzRkIjAPY3h7EsQ6v16x3fwRE1x04UYJ2og0",
      apiEmail: "yangcongzhao123@gmail.com",
    },
  }),
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});

// 处理 CORS 请求
addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const origin = request.headers.get('Origin');
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;

  // 处理预检请求（OPTIONS）
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        ...CORS_HEADERS,
      },
    });
  }

  // 处理实际请求
  const response = await mastra.handleRequest(request); // 假设 Mastra 提供了 handleRequest 方法
  const newResponse = new Response(response.body, response);

  // 添加 CORS 头到响应
  if (allowedOrigin) {
    newResponse.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      newResponse.headers.set(key, value);
    });
  }

  return newResponse;
}
