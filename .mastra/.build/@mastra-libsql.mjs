import { createClient } from '@libsql/client';
import { M as MastraStorage } from './chunk-TAFOICHR.mjs';
import { T as TABLE_WORKFLOW_SNAPSHOT, a as TABLE_THREADS, b as TABLE_MESSAGES, c as TABLE_EVALS, d as TABLE_TRACES } from './storage.mjs';

function safelyParseJSON(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return {};
  }
}
var LibSQLStore = class extends MastraStorage {
  client;
  constructor(config) {
    super({ name: `LibSQLStore` });
    if (config.url.endsWith(":memory:")) {
      this.shouldCacheInit = false;
    }
    this.client = createClient(config);
  }
  getCreateTableSQL(tableName, schema) {
    const columns = Object.entries(schema).map(([name, col]) => {
      let type = col.type.toUpperCase();
      if (type === "TEXT") type = "TEXT";
      if (type === "TIMESTAMP") type = "TEXT";
      const nullable = col.nullable ? "" : "NOT NULL";
      const primaryKey = col.primaryKey ? "PRIMARY KEY" : "";
      return `${name} ${type} ${nullable} ${primaryKey}`.trim();
    });
    if (tableName === TABLE_WORKFLOW_SNAPSHOT) {
      const stmnt = `CREATE TABLE IF NOT EXISTS ${tableName} (
                ${columns.join(",\n")},
                PRIMARY KEY (workflow_name, run_id)
            )`;
      return stmnt;
    }
    return `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(", ")})`;
  }
  async createTable({
    tableName,
    schema
  }) {
    try {
      this.logger.debug(`Creating database table`, { tableName, operation: "schema init" });
      const sql = this.getCreateTableSQL(tableName, schema);
      await this.client.execute(sql);
    } catch (error) {
      this.logger.error(`Error creating table ${tableName}: ${error}`);
      throw error;
    }
  }
  async clearTable({ tableName }) {
    try {
      await this.client.execute(`DELETE FROM ${tableName}`);
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.message);
      }
    }
  }
  prepareStatement({ tableName, record }) {
    const columns = Object.keys(record);
    const values = Object.values(record).map((v) => {
      if (typeof v === `undefined`) {
        return null;
      }
      if (v instanceof Date) {
        return v.toISOString();
      }
      return typeof v === "object" ? JSON.stringify(v) : v;
    });
    const placeholders = values.map(() => "?").join(", ");
    return {
      sql: `INSERT OR REPLACE INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
      args: values
    };
  }
  async insert({ tableName, record }) {
    try {
      await this.client.execute(
        this.prepareStatement({
          tableName,
          record
        })
      );
    } catch (error) {
      this.logger.error(`Error upserting into table ${tableName}: ${error}`);
      throw error;
    }
  }
  async batchInsert({ tableName, records }) {
    if (records.length === 0) return;
    try {
      const batchStatements = records.map((r) => this.prepareStatement({ tableName, record: r }));
      await this.client.batch(batchStatements, "write");
    } catch (error) {
      this.logger.error(`Error upserting into table ${tableName}: ${error}`);
      throw error;
    }
  }
  async load({ tableName, keys }) {
    const conditions = Object.entries(keys).map(([key]) => `${key} = ?`).join(" AND ");
    const values = Object.values(keys);
    const result = await this.client.execute({
      sql: `SELECT * FROM ${tableName} WHERE ${conditions} ORDER BY createdAt DESC LIMIT 1`,
      args: values
    });
    if (!result.rows || result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    const parsed = Object.fromEntries(
      Object.entries(row || {}).map(([k, v]) => {
        try {
          return [k, typeof v === "string" ? v.startsWith("{") || v.startsWith("[") ? JSON.parse(v) : v : v];
        } catch {
          return [k, v];
        }
      })
    );
    return parsed;
  }
  async getThreadById({ threadId }) {
    const result = await this.load({
      tableName: TABLE_THREADS,
      keys: { id: threadId }
    });
    if (!result) {
      return null;
    }
    return {
      ...result,
      metadata: typeof result.metadata === "string" ? JSON.parse(result.metadata) : result.metadata
    };
  }
  async getThreadsByResourceId({ resourceId }) {
    const result = await this.client.execute({
      sql: `SELECT * FROM ${TABLE_THREADS} WHERE resourceId = ?`,
      args: [resourceId]
    });
    if (!result.rows) {
      return [];
    }
    return result.rows.map((thread) => ({
      id: thread.id,
      resourceId: thread.resourceId,
      title: thread.title,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      metadata: typeof thread.metadata === "string" ? JSON.parse(thread.metadata) : thread.metadata
    }));
  }
  async saveThread({ thread }) {
    await this.insert({
      tableName: TABLE_THREADS,
      record: {
        ...thread,
        metadata: JSON.stringify(thread.metadata)
      }
    });
    return thread;
  }
  async updateThread({
    id,
    title,
    metadata
  }) {
    const thread = await this.getThreadById({ threadId: id });
    if (!thread) {
      throw new Error(`Thread ${id} not found`);
    }
    const updatedThread = {
      ...thread,
      title,
      metadata: {
        ...thread.metadata,
        ...metadata
      }
    };
    await this.client.execute({
      sql: `UPDATE ${TABLE_THREADS} SET title = ?, metadata = ? WHERE id = ?`,
      args: [title, JSON.stringify(updatedThread.metadata), id]
    });
    return updatedThread;
  }
  async deleteThread({ threadId }) {
    await this.client.execute({
      sql: `DELETE FROM ${TABLE_THREADS} WHERE id = ?`,
      args: [threadId]
    });
  }
  parseRow(row) {
    let content = row.content;
    try {
      content = JSON.parse(row.content);
    } catch {
    }
    return {
      id: row.id,
      content,
      role: row.role,
      type: row.type,
      createdAt: new Date(row.createdAt),
      threadId: row.thread_id
    };
  }
  async getMessages({ threadId, selectBy }) {
    try {
      const messages = [];
      const limit = typeof selectBy?.last === `number` ? selectBy.last : 40;
      if (selectBy?.include?.length) {
        const includeIds = selectBy.include.map((i) => i.id);
        const maxPrev = Math.max(...selectBy.include.map((i) => i.withPreviousMessages || 0));
        const maxNext = Math.max(...selectBy.include.map((i) => i.withNextMessages || 0));
        const includeResult = await this.client.execute({
          sql: `
            WITH numbered_messages AS (
              SELECT 
                id,
                content,
                role,
                type,
                "createdAt",
                thread_id,
                ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) as row_num
              FROM "${TABLE_MESSAGES}"
              WHERE thread_id = ?
            ),
            target_positions AS (
              SELECT row_num as target_pos
              FROM numbered_messages
              WHERE id IN (${includeIds.map(() => "?").join(", ")})
            )
            SELECT DISTINCT m.*
            FROM numbered_messages m
            CROSS JOIN target_positions t
            WHERE m.row_num BETWEEN (t.target_pos - ?) AND (t.target_pos + ?)
            ORDER BY m."createdAt" ASC
          `,
          args: [threadId, ...includeIds, maxPrev, maxNext]
        });
        if (includeResult.rows) {
          messages.push(...includeResult.rows.map((row) => this.parseRow(row)));
        }
      }
      const excludeIds = messages.map((m) => m.id);
      const remainingSql = `
        SELECT 
          id, 
          content, 
          role, 
          type,
          "createdAt", 
          thread_id
        FROM "${TABLE_MESSAGES}"
        WHERE thread_id = ?
        ${excludeIds.length ? `AND id NOT IN (${excludeIds.map(() => "?").join(", ")})` : ""}
        ORDER BY "createdAt" DESC
        LIMIT ?
      `;
      const remainingArgs = [threadId, ...excludeIds.length ? excludeIds : [], limit];
      const remainingResult = await this.client.execute({
        sql: remainingSql,
        args: remainingArgs
      });
      if (remainingResult.rows) {
        messages.push(...remainingResult.rows.map((row) => this.parseRow(row)));
      }
      messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return messages;
    } catch (error) {
      this.logger.error("Error getting messages:", error);
      throw error;
    }
  }
  async saveMessages({ messages }) {
    if (messages.length === 0) return messages;
    try {
      const threadId = messages[0]?.threadId;
      if (!threadId) {
        throw new Error("Thread ID is required");
      }
      const batchStatements = messages.map((message) => {
        const time = message.createdAt || /* @__PURE__ */ new Date();
        return {
          sql: `INSERT INTO ${TABLE_MESSAGES} (id, thread_id, content, role, type, createdAt) 
                VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            message.id,
            threadId,
            typeof message.content === "object" ? JSON.stringify(message.content) : message.content,
            message.role,
            message.type,
            time instanceof Date ? time.toISOString() : time
          ]
        };
      });
      await this.client.batch(batchStatements, "write");
      return messages;
    } catch (error) {
      this.logger.error("Failed to save messages in database: " + error?.message);
      throw error;
    }
  }
  transformEvalRow(row) {
    const resultValue = JSON.parse(row.result);
    const testInfoValue = row.test_info ? JSON.parse(row.test_info) : void 0;
    if (!resultValue || typeof resultValue !== "object" || !("score" in resultValue)) {
      throw new Error(`Invalid MetricResult format: ${JSON.stringify(resultValue)}`);
    }
    return {
      input: row.input,
      output: row.output,
      result: resultValue,
      agentName: row.agent_name,
      metricName: row.metric_name,
      instructions: row.instructions,
      testInfo: testInfoValue,
      globalRunId: row.global_run_id,
      runId: row.run_id,
      createdAt: row.created_at
    };
  }
  async getEvalsByAgentName(agentName, type) {
    try {
      const baseQuery = `SELECT * FROM ${TABLE_EVALS} WHERE agent_name = ?`;
      const typeCondition = type === "test" ? " AND test_info IS NOT NULL AND test_info->>'testPath' IS NOT NULL" : type === "live" ? " AND (test_info IS NULL OR test_info->>'testPath' IS NULL)" : "";
      const result = await this.client.execute({
        sql: `${baseQuery}${typeCondition} ORDER BY created_at DESC`,
        args: [agentName]
      });
      return result.rows?.map((row) => this.transformEvalRow(row)) ?? [];
    } catch (error) {
      if (error instanceof Error && error.message.includes("no such table")) {
        return [];
      }
      this.logger.error("Failed to get evals for the specified agent: " + error?.message);
      throw error;
    }
  }
  // TODO: add types
  async getTraces({
    name,
    scope,
    page,
    perPage,
    attributes,
    filters,
    fromDate,
    toDate
  } = {
    page: 0,
    perPage: 100
  }) {
    const limit = perPage;
    const offset = page * perPage;
    const args = [];
    const conditions = [];
    if (name) {
      conditions.push("name LIKE CONCAT(?, '%')");
    }
    if (scope) {
      conditions.push("scope = ?");
    }
    if (attributes) {
      Object.keys(attributes).forEach((key) => {
        conditions.push(`attributes->>'$.${key}' = ?`);
      });
    }
    if (filters) {
      Object.entries(filters).forEach(([key, _value]) => {
        conditions.push(`${key} = ?`);
      });
    }
    if (fromDate) {
      conditions.push("createdAt >= ?");
    }
    if (toDate) {
      conditions.push("createdAt <= ?");
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    if (name) {
      args.push(name);
    }
    if (scope) {
      args.push(scope);
    }
    if (attributes) {
      for (const [, value] of Object.entries(attributes)) {
        args.push(value);
      }
    }
    if (filters) {
      for (const [, value] of Object.entries(filters)) {
        args.push(value);
      }
    }
    if (fromDate) {
      args.push(fromDate.toISOString());
    }
    if (toDate) {
      args.push(toDate.toISOString());
    }
    args.push(limit, offset);
    const result = await this.client.execute({
      sql: `SELECT * FROM ${TABLE_TRACES} ${whereClause} ORDER BY "startTime" DESC LIMIT ? OFFSET ?`,
      args
    });
    if (!result.rows) {
      return [];
    }
    return result.rows.map((row) => ({
      id: row.id,
      parentSpanId: row.parentSpanId,
      traceId: row.traceId,
      name: row.name,
      scope: row.scope,
      kind: row.kind,
      status: safelyParseJSON(row.status),
      events: safelyParseJSON(row.events),
      links: safelyParseJSON(row.links),
      attributes: safelyParseJSON(row.attributes),
      startTime: row.startTime,
      endTime: row.endTime,
      other: safelyParseJSON(row.other),
      createdAt: row.createdAt
    }));
  }
  async getWorkflowRuns({
    workflowName,
    fromDate,
    toDate,
    limit,
    offset,
    resourceId
  } = {}) {
    try {
      const conditions = [];
      const args = [];
      if (workflowName) {
        conditions.push("workflow_name = ?");
        args.push(workflowName);
      }
      if (fromDate) {
        conditions.push("createdAt >= ?");
        args.push(fromDate.toISOString());
      }
      if (toDate) {
        conditions.push("createdAt <= ?");
        args.push(toDate.toISOString());
      }
      if (resourceId) {
        const hasResourceId = await this.hasColumn(TABLE_WORKFLOW_SNAPSHOT, "resourceId");
        if (hasResourceId) {
          conditions.push("resourceId = ?");
          args.push(resourceId);
        } else {
          console.warn(`[${TABLE_WORKFLOW_SNAPSHOT}] resourceId column not found. Skipping resourceId filter.`);
        }
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      let total = 0;
      if (limit !== void 0 && offset !== void 0) {
        const countResult = await this.client.execute({
          sql: `SELECT COUNT(*) as count FROM ${TABLE_WORKFLOW_SNAPSHOT} ${whereClause}`,
          args
        });
        total = Number(countResult.rows?.[0]?.count ?? 0);
      }
      const result = await this.client.execute({
        sql: `SELECT * FROM ${TABLE_WORKFLOW_SNAPSHOT} ${whereClause} ORDER BY createdAt DESC${limit !== void 0 && offset !== void 0 ? ` LIMIT ? OFFSET ?` : ""}`,
        args: limit !== void 0 && offset !== void 0 ? [...args, limit, offset] : args
      });
      const runs = (result.rows || []).map((row) => this.parseWorkflowRun(row));
      return { runs, total: total || runs.length };
    } catch (error) {
      console.error("Error getting workflow runs:", error);
      throw error;
    }
  }
  async getWorkflowRunById({
    runId,
    workflowName
  }) {
    const conditions = [];
    const args = [];
    if (runId) {
      conditions.push("run_id = ?");
      args.push(runId);
    }
    if (workflowName) {
      conditions.push("workflow_name = ?");
      args.push(workflowName);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.client.execute({
      sql: `SELECT * FROM ${TABLE_WORKFLOW_SNAPSHOT} ${whereClause}`,
      args
    });
    if (!result.rows?.[0]) {
      return null;
    }
    return this.parseWorkflowRun(result.rows[0]);
  }
  async hasColumn(table, column) {
    const result = await this.client.execute({
      sql: `PRAGMA table_info(${table})`
    });
    return (await result.rows)?.some((row) => row.name === column);
  }
  parseWorkflowRun(row) {
    let parsedSnapshot = row.snapshot;
    if (typeof parsedSnapshot === "string") {
      try {
        parsedSnapshot = JSON.parse(row.snapshot);
      } catch (e) {
        console.warn(`Failed to parse snapshot for workflow ${row.workflow_name}: ${e}`);
      }
    }
    return {
      workflowName: row.workflow_name,
      runId: row.run_id,
      snapshot: parsedSnapshot,
      resourceId: row.resourceId,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
};

export { LibSQLStore };
