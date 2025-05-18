
import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { CloudflareDeployer } from "@mastra/deployer-cloudflare";

import { codeReviewAgent } from './agents';

export const mastra = new Mastra({
  deployer: new CloudflareDeployer({
    scope: "d5b3bb970da79f07a9fb614e60d02766",
    projectName: "yc-mastra-app",
    routes: [],
    workerNamespace: "3223a366bb61449b8eaa2981622663d9",
    auth: {
      apiToken: "UM7POzRkIjAPY3h7EsQ6v16x3fwRE1x04UYJ2og0",
      apiEmail: "yangcongzhao123@gmail.com",
    },
  }),
  agents: { codeReviewAgent },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
