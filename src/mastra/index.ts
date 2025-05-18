import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { codeReviewAgent } from './agents';
export const mastra = new Mastra({
  server: {
    // 配置CORS，解决跨域问题
    cors: {
      origin: '*', // 允许所有来源访问，生产环境应该限制为特定域名
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
  },
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
