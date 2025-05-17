import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { CloudflareDeployer } from '@mastra/deployer-cloudflare';

import { codeReviewAgent } from './agents';

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
  },
});
