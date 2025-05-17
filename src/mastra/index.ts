import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { CloudflareDeployer } from '@mastra/deployer-cloudflare';

import { codeReviewAgent } from './agents';

// 定义允许的前端来源（基于 Worker 代码）
const ALLOWED_ORIGINS = [
  'https://zhaoyangkuajing.cyou',
  'https://deepseek-pages-demo.pages.dev',
  'http://localhost:3000',
];

export const mastra = new Mastra({
  deployer: new CloudflareDeployer({
    scope: 'd5b3bb970da79f07a9fb614e60d02766',
    projectName: 'yc-mastra-app',
    routes: [
      {
        pattern: 'yc-mastra-app.yangcongzhao123.workers.dev/*',
        zone_name: 'yangcongzhao123.workers.dev',
        custom_domain: false,
      },
      {
        pattern: 'zhaoyangkuajing.cyou/*',
        zone_name: 'zhaoyangkuajing.cyou',
        custom_domain: true,
      },
    ],
    workerNamespace: '3223a366bb61449b8eaa2981622663d9',
    auth: {
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      apiEmail: 'yangcongzhao123@gmail.com',
    },
    environment: {
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      MASTRA_API_KEY: process.env.MASTRA_API_KEY,
      TURSO_URL: process.env.TURSO_URL,
      TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    },
  }),
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    url: ':memory:',
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
    middleware: [
      {
        path: '/api/agents/:agentId/*',
        handler: async (c, next) => {
          const origin = c.req.header('Origin');
          const isAllowedOrigin =
              ALLOWED_ORIGINS.includes(origin) || origin?.endsWith('.pages.dev');

          if (c.req.method === 'OPTIONS') {
            return c.json(null, {
              status: 204,
              headers: {
                'Access-Control-Allow-Origin': isAllowedOrigin ? origin : ALLOWED_ORIGINS[0],
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
                'Access-Control-Max-Age': '86400',
              },
            });
          }

          await next();

          c.res.headers.set(
              'Access-Control-Allow-Origin',
              isAllowedOrigin ? origin : ALLOWED_ORIGINS[0]
          );
        },
      },
      {
        path: '/api/agents/:agentId/generate',
        handler: async (c, next) => {
          const apiKey = c.req.header('X-API-Key');
          if (!apiKey || apiKey !== process.env.MASTRA_API_KEY) {
            return c.json({ error: 'Invalid or missing API key' }, 401);
          }
          await next();
        },
      },
    ],
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-API-Key'],
      credentials: false,
    },
  },
});
