import { T as TABLE_WORKFLOW_SNAPSHOT, c as TABLE_EVALS, b as TABLE_MESSAGES, a as TABLE_THREADS, d as TABLE_TRACES, e as TABLE_SCHEMAS } from './storage.mjs';
import { M as MastraBase } from './trace-api.mjs';

// src/storage/base.ts
var MastraStorage = class extends MastraBase {
  /** @deprecated import from { TABLE_WORKFLOW_SNAPSHOT } '@mastra/core/storage' instead */
  static TABLE_WORKFLOW_SNAPSHOT = TABLE_WORKFLOW_SNAPSHOT;
  /** @deprecated import from { TABLE_EVALS } '@mastra/core/storage' instead */
  static TABLE_EVALS = TABLE_EVALS;
  /** @deprecated import from { TABLE_MESSAGES } '@mastra/core/storage' instead */
  static TABLE_MESSAGES = TABLE_MESSAGES;
  /** @deprecated import from { TABLE_THREADS } '@mastra/core/storage' instead */
  static TABLE_THREADS = TABLE_THREADS;
  /** @deprecated import { TABLE_TRACES } from '@mastra/core/storage' instead */
  static TABLE_TRACES = TABLE_TRACES;
  hasInitialized = null;
  shouldCacheInit = true;
  constructor({ name }) {
    super({
      component: "STORAGE",
      name
    });
  }
  batchTraceInsert({ records }) {
    return this.batchInsert({ tableName: TABLE_TRACES, records });
  }
  async init() {
    if (this.shouldCacheInit && await this.hasInitialized) {
      return;
    }
    this.hasInitialized = Promise.all([
      this.createTable({
        tableName: TABLE_WORKFLOW_SNAPSHOT,
        schema: TABLE_SCHEMAS[TABLE_WORKFLOW_SNAPSHOT]
      }),
      this.createTable({
        tableName: TABLE_EVALS,
        schema: TABLE_SCHEMAS[TABLE_EVALS]
      }),
      this.createTable({
        tableName: TABLE_THREADS,
        schema: TABLE_SCHEMAS[TABLE_THREADS]
      }),
      this.createTable({
        tableName: TABLE_MESSAGES,
        schema: TABLE_SCHEMAS[TABLE_MESSAGES]
      }),
      this.createTable({
        tableName: TABLE_TRACES,
        schema: TABLE_SCHEMAS[TABLE_TRACES]
      })
    ]).then(() => true);
    await this.hasInitialized;
  }
  async persistWorkflowSnapshot({
    workflowName,
    runId,
    snapshot
  }) {
    await this.init();
    const data = {
      workflow_name: workflowName,
      run_id: runId,
      snapshot,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    this.logger.debug("Persisting workflow snapshot", { workflowName, runId, data });
    await this.insert({
      tableName: TABLE_WORKFLOW_SNAPSHOT,
      record: data
    });
  }
  async loadWorkflowSnapshot({
    workflowName,
    runId
  }) {
    if (!this.hasInitialized) {
      await this.init();
    }
    this.logger.debug("Loading workflow snapshot", { workflowName, runId });
    const d = await this.load({
      tableName: TABLE_WORKFLOW_SNAPSHOT,
      keys: { workflow_name: workflowName, run_id: runId }
    });
    return d ? d.snapshot : null;
  }
};

// src/storage/default-proxy-storage.ts
var DefaultProxyStorage = class extends MastraStorage {
  storage = null;
  storageConfig;
  isInitializingPromise = null;
  constructor({ config }) {
    super({ name: "DefaultStorage" });
    this.storageConfig = config;
  }
  setupStorage() {
    if (!this.isInitializingPromise) {
      this.isInitializingPromise = new Promise((resolve, reject) => {
        import('./index.mjs').then(({ DefaultStorage }) => {
          this.storage = new DefaultStorage({ config: this.storageConfig });
          resolve();
        }).catch(reject);
      });
    }
    return this.isInitializingPromise;
  }
  async createTable({
    tableName,
    schema
  }) {
    await this.setupStorage();
    return this.storage.createTable({ tableName, schema });
  }
  async clearTable({ tableName }) {
    await this.setupStorage();
    return this.storage.clearTable({ tableName });
  }
  async insert({ tableName, record }) {
    await this.setupStorage();
    return this.storage.insert({ tableName, record });
  }
  async batchInsert({ tableName, records }) {
    await this.setupStorage();
    return this.storage.batchInsert({ tableName, records });
  }
  async load({ tableName, keys }) {
    await this.setupStorage();
    return this.storage.load({ tableName, keys });
  }
  async getThreadById({ threadId }) {
    await this.setupStorage();
    return this.storage.getThreadById({ threadId });
  }
  async getThreadsByResourceId({ resourceId }) {
    await this.setupStorage();
    return this.storage.getThreadsByResourceId({ resourceId });
  }
  async saveThread({ thread }) {
    await this.setupStorage();
    return this.storage.saveThread({ thread });
  }
  async updateThread({
    id,
    title,
    metadata
  }) {
    await this.setupStorage();
    return this.storage.updateThread({ id, title, metadata });
  }
  async deleteThread({ threadId }) {
    await this.setupStorage();
    return this.storage.deleteThread({ threadId });
  }
  async getMessages({ threadId, selectBy }) {
    await this.setupStorage();
    return this.storage.getMessages({ threadId, selectBy });
  }
  async saveMessages({ messages }) {
    await this.setupStorage();
    return this.storage.saveMessages({ messages });
  }
  async getEvalsByAgentName(agentName, type) {
    await this.setupStorage();
    return this.storage.getEvalsByAgentName(agentName, type);
  }
  async getTraces(options) {
    await this.setupStorage();
    return this.storage.getTraces(options);
  }
  async getWorkflowRuns(args) {
    await this.setupStorage();
    return this.storage.getWorkflowRuns(args);
  }
  async getWorkflowRunById(args) {
    await this.setupStorage();
    return this.storage.getWorkflowRunById(args);
  }
};

// src/storage/storageWithInit.ts
var isAugmentedSymbol = Symbol("isAugmented");
function augmentWithInit(storage) {
  let hasInitialized = null;
  const ensureInit = async () => {
    if (!hasInitialized) {
      hasInitialized = storage.init();
    }
    await hasInitialized;
  };
  if (storage[isAugmentedSymbol]) {
    return storage;
  }
  const proxy = new Proxy(storage, {
    get(target, prop) {
      const value = target[prop];
      if (typeof value === "function" && prop !== "init") {
        return async (...args) => {
          await ensureInit();
          return Reflect.apply(value, target, args);
        };
      }
      return Reflect.get(target, prop);
    }
  });
  Object.defineProperty(proxy, isAugmentedSymbol, {
    value: true,
    enumerable: false,
    // Won't show up in Object.keys() or for...in loops
    configurable: true
    // Allows the property to be deleted or modified later if needed
  });
  return proxy;
}

export { DefaultProxyStorage as D, MastraStorage as M, augmentWithInit as a };
