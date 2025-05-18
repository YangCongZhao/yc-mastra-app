import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { CloudflareDeployer } from "@mastra/deployer-cloudflare";

import { codeReviewAgent } from './agents';

const mastra = new Mastra({
  deployer: new CloudflareDeployer({
    scope: "d5b3bb970da79f07a9fb614e60d02766",
    projectName: "yc-mastra-app",
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
    workerNamespace: "3223a366bb61449b8eaa2981622663d9",
    auth: {
      apiToken: "UM7POzRkIjAPY3h7EsQ6v16x3fwRE1x04UYJ2og0",
      apiEmail: "yangcongzhao123@gmail.com",
    },
    wrapHandler: (handler) => {
      return async (request: Request) => {
        // 处理 CORS 预检
        if (request.method === "OPTIONS") {
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
              "Access-Control-Allow-Credentials": "true",
            },
          });
        }
        const response = await handler(request);

        const origin = request.headers.get("Origin") || "*";
        const headers = new Headers(response.headers);
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        headers.set("Access-Control-Allow-Credentials", "true");

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      };
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
