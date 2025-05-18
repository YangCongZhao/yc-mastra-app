import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { codeReviewAgent } from './agents';

export const mastra = new Mastra({
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    url: "file:../mastra.db",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    cors: {
      origin: '*', // 允许所有来源
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // 允许的 HTTP 方法
      allowHeaders: ['*'], // 允许所有请求头
      exposeHeaders: ['*'], // 暴露所有响应头
      credentials: false, // 不允许凭据（如 cookies）
    },
  },
});
