import { Transform } from 'stream';
import pino from 'pino';
import pretty from 'pino-pretty';

// src/logger/index.ts
var RegisteredLogger = {
  AGENT: "AGENT",
  LLM: "LLM"};
var LogLevel = {
  INFO: "info",
  WARN: "warn"};
var Logger = class {
  logger;
  transports;
  constructor(options = {}) {
    this.transports = options.transports || {};
    const transportsAry = Object.entries(this.transports);
    this.logger = pino(
      {
        name: options.name || "app",
        level: options.level || LogLevel.INFO,
        formatters: {
          level: (label) => {
            return {
              level: label
            };
          }
        }
      },
      options.overrideDefaultTransports ? options?.transports?.default : transportsAry.length === 0 ? pretty({
        colorize: true,
        levelFirst: true,
        ignore: "pid,hostname",
        colorizeObjects: true,
        translateTime: "SYS:standard",
        singleLine: false
      }) : pino.multistream([
        ...transportsAry.map(([, transport]) => ({
          stream: transport,
          level: options.level || LogLevel.INFO
        })),
        {
          stream: pretty({
            colorize: true,
            levelFirst: true,
            ignore: "pid,hostname",
            colorizeObjects: true,
            translateTime: "SYS:standard",
            singleLine: false
          }),
          level: options.level || LogLevel.INFO
        }
      ])
    );
  }
  debug(message, args = {}) {
    this.logger.debug(args, message);
  }
  info(message, args = {}) {
    this.logger.info(args, message);
  }
  warn(message, args = {}) {
    this.logger.warn(args, message);
  }
  error(message, args = {}) {
    this.logger.error(args, message);
  }
  // Stream creation for process output handling
  createStream() {
    return new Transform({
      transform: (chunk, _encoding, callback) => {
        const line = chunk.toString().trim();
        if (line) {
          this.info(line);
        }
        callback(null, chunk);
      }
    });
  }
  async getLogs(transportId) {
    if (!transportId || !this.transports[transportId]) {
      return [];
    }
    return this.transports[transportId].getLogs();
  }
  async getLogsByRunId({ runId, transportId }) {
    return this.transports[transportId]?.getLogsByRunId({ runId });
  }
};
function createLogger(options) {
  return new Logger(options);
}
var noopLogger = {
  debug: () => {
  },
  info: () => {
  },
  warn: () => {
  },
  error: () => {
  },
  cleanup: async () => {
  }
};

export { LogLevel as L, RegisteredLogger as R, createLogger as c, noopLogger as n };
