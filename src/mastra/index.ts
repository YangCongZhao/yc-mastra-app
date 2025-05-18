import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { CloudflareDeployer } from "@mastra/deployer-cloudflare";
import { codeReviewAgent } from './agents';

export const mastra = new Mastra({
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
// 基础的 CORS 响应头注入
function withCors(request: Request, response: Response): Response {
  const origin = request.headers.get("Origin") || "*";
  const headers = new Headers(response.headers);

  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Credentials", "true");

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    // 处理预检请求
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

    const url = new URL(request.url);

    try {
      // 调用对应 agent
      if (url.pathname === "/agent/codeReviewAgent" && request.method === "POST") {
        const reqBody = await request.json();

        const result = await mastra.call("codeReviewAgent", {
          messages: reqBody.messages,
        });

        const jsonRes = new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });

        return withCors(request, jsonRes);
      }

      // 未匹配路径
      return new Response("Not Found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      });

    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || 'Internal Error' }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  }
};
