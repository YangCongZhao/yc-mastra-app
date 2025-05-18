import { Agent } from './@mastra-core-agent.mjs';
export { T as Telemetry } from './chunk-C6A6W6XS.mjs';

// src/agent/index.warning.ts
var Agent2 = class extends Agent {
  constructor(config) {
    super(config);
    this.logger.warn('Please import "Agent from "@mastra/core/agent" instead of "@mastra/core"');
  }
};

export { Agent2 as Agent };
