import { e as experimental_customProvider, d as deepMerge, a as embedMany } from './utils.mjs';
import { l as lib } from './_virtual__virtual-zod.mjs';
import { M as MastraBase } from './trace-api.mjs';
import { isAbsolute, join, resolve } from 'path';
import { createClient } from '@libsql/client';
import { D as DefaultProxyStorage, a as augmentWithInit } from './chunk-CTKNWYK2.mjs';
import { existsSync } from 'fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// src/vector/vector.ts
var MastraVector = class extends MastraBase {
  constructor() {
    super({ name: "MastraVector", component: "VECTOR" });
  }
  get indexSeparator() {
    return "_";
  }
  baseKeys = {
    query: ["queryVector", "topK", "filter", "includeVector"],
    upsert: ["vectors", "metadata", "ids"],
    createIndex: ["dimension", "metric"]
  };
  normalizeArgs(method, [first, ...rest], extendedKeys = []) {
    if (typeof first === "object") {
      return first;
    }
    this.logger.warn(
      `Deprecation Warning: Passing individual arguments to ${method}() is deprecated.
      Please use an object parameter instead.
      Individual arguments will be removed on May 20th, 2025.`
    );
    const baseKeys = this.baseKeys[method] || [];
    const paramKeys = [...baseKeys, ...extendedKeys].slice(0, rest.length);
    return {
      indexName: first,
      ...Object.fromEntries(paramKeys.map((key, i) => [key, rest[i]]))
    };
  }
  async validateExistingIndex(indexName, dimension, metric) {
    let info;
    try {
      info = await this.describeIndex(indexName);
    } catch (infoError) {
      const message = `Index "${indexName}" already exists, but failed to fetch index info for dimension check: ${infoError}`;
      this.logger?.error(message);
      throw new Error(message);
    }
    const existingDim = info?.dimension;
    const existingMetric = info?.metric;
    if (existingDim === dimension) {
      this.logger?.info(
        `Index "${indexName}" already exists with ${existingDim} dimensions and metric ${existingMetric}, skipping creation.`
      );
      if (existingMetric !== metric) {
        this.logger?.warn(
          `Attempted to create index with metric "${metric}", but index already exists with metric "${existingMetric}". To use a different metric, delete and recreate the index.`
        );
      }
    } else if (info) {
      const message = `Index "${indexName}" already exists with ${existingDim} dimensions, but ${dimension} dimensions were requested`;
      this.logger?.error(message);
      throw new Error(message);
    } else {
      const message = `Index "${indexName}" already exists, but could not retrieve its dimensions for validation.`;
      this.logger?.error(message);
      throw new Error(message);
    }
  }
};

// src/vector/filter/base.ts
var BaseFilterTranslator = class _BaseFilterTranslator {
  /**
   * Operator type checks
   */
  isOperator(key) {
    return key.startsWith("$");
  }
  static BASIC_OPERATORS = ["$eq", "$ne"];
  static NUMERIC_OPERATORS = ["$gt", "$gte", "$lt", "$lte"];
  static ARRAY_OPERATORS = ["$in", "$nin", "$all", "$elemMatch"];
  static LOGICAL_OPERATORS = ["$and", "$or", "$not", "$nor"];
  static ELEMENT_OPERATORS = ["$exists"];
  static REGEX_OPERATORS = ["$regex", "$options"];
  static DEFAULT_OPERATORS = {
    logical: _BaseFilterTranslator.LOGICAL_OPERATORS,
    basic: _BaseFilterTranslator.BASIC_OPERATORS,
    numeric: _BaseFilterTranslator.NUMERIC_OPERATORS,
    array: _BaseFilterTranslator.ARRAY_OPERATORS,
    element: _BaseFilterTranslator.ELEMENT_OPERATORS,
    regex: _BaseFilterTranslator.REGEX_OPERATORS
  };
  isLogicalOperator(key) {
    return _BaseFilterTranslator.DEFAULT_OPERATORS.logical.includes(key);
  }
  isBasicOperator(key) {
    return _BaseFilterTranslator.DEFAULT_OPERATORS.basic.includes(key);
  }
  isNumericOperator(key) {
    return _BaseFilterTranslator.DEFAULT_OPERATORS.numeric.includes(key);
  }
  isArrayOperator(key) {
    return _BaseFilterTranslator.DEFAULT_OPERATORS.array.includes(key);
  }
  isElementOperator(key) {
    return _BaseFilterTranslator.DEFAULT_OPERATORS.element.includes(key);
  }
  isRegexOperator(key) {
    return _BaseFilterTranslator.DEFAULT_OPERATORS.regex.includes(key);
  }
  isFieldOperator(key) {
    return this.isOperator(key) && !this.isLogicalOperator(key);
  }
  isCustomOperator(key) {
    const support = this.getSupportedOperators();
    return support.custom?.includes(key) ?? false;
  }
  getSupportedOperators() {
    return _BaseFilterTranslator.DEFAULT_OPERATORS;
  }
  isValidOperator(key) {
    const support = this.getSupportedOperators();
    const allSupported = Object.values(support).flat();
    return allSupported.includes(key);
  }
  /**
   * Value normalization for comparison operators
   */
  normalizeComparisonValue(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "number" && Object.is(value, -0)) {
      return 0;
    }
    return value;
  }
  /**
   * Helper method to simulate $all operator using $and + $eq when needed.
   * Some vector stores don't support $all natively.
   */
  simulateAllOperator(field, values) {
    return {
      $and: values.map((value) => ({
        [field]: { $in: [this.normalizeComparisonValue(value)] }
      }))
    };
  }
  /**
   * Utility functions for type checking
   */
  isPrimitive(value) {
    return value === null || value === void 0 || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }
  isRegex(value) {
    return value instanceof RegExp;
  }
  isEmpty(obj) {
    return obj === null || obj === void 0 || typeof obj === "object" && Object.keys(obj).length === 0;
  }
  static ErrorMessages = {
    UNSUPPORTED_OPERATOR: (op) => `Unsupported operator: ${op}`,
    INVALID_LOGICAL_OPERATOR_LOCATION: (op, path) => `Logical operator ${op} cannot be used at field level: ${path}`,
    NOT_REQUIRES_OBJECT: `$not operator requires an object`,
    NOT_CANNOT_BE_EMPTY: `$not operator cannot be empty`,
    INVALID_LOGICAL_OPERATOR_CONTENT: (path) => `Logical operators must contain field conditions, not direct operators: ${path}`,
    INVALID_TOP_LEVEL_OPERATOR: (op) => `Invalid top-level operator: ${op}`,
    ELEM_MATCH_REQUIRES_OBJECT: `$elemMatch requires an object with conditions`
  };
  /**
   * Helper to handle array value normalization consistently
   */
  normalizeArrayValues(values) {
    return values.map((value) => this.normalizeComparisonValue(value));
  }
  validateFilter(filter) {
    const validation = this.validateFilterSupport(filter);
    if (!validation.supported) {
      throw new Error(validation.messages.join(", "));
    }
  }
  /**
   * Validates if a filter structure is supported by the specific vector DB
   * and returns detailed validation information.
   */
  validateFilterSupport(node, path = "") {
    const messages = [];
    if (this.isPrimitive(node) || this.isEmpty(node)) {
      return { supported: true, messages: [] };
    }
    if (Array.isArray(node)) {
      const arrayResults = node.map((item) => this.validateFilterSupport(item, path));
      const arrayMessages = arrayResults.flatMap((r) => r.messages);
      return {
        supported: arrayResults.every((r) => r.supported),
        messages: arrayMessages
      };
    }
    const nodeObj = node;
    let isSupported = true;
    for (const [key, value] of Object.entries(nodeObj)) {
      const newPath = path ? `${path}.${key}` : key;
      if (this.isOperator(key)) {
        if (!this.isValidOperator(key)) {
          isSupported = false;
          messages.push(_BaseFilterTranslator.ErrorMessages.UNSUPPORTED_OPERATOR(key));
          continue;
        }
        if (!path && !this.isLogicalOperator(key)) {
          isSupported = false;
          messages.push(_BaseFilterTranslator.ErrorMessages.INVALID_TOP_LEVEL_OPERATOR(key));
          continue;
        }
        if (key === "$elemMatch" && (typeof value !== "object" || Array.isArray(value))) {
          isSupported = false;
          messages.push(_BaseFilterTranslator.ErrorMessages.ELEM_MATCH_REQUIRES_OBJECT);
          continue;
        }
        if (this.isLogicalOperator(key)) {
          if (key === "$not") {
            if (Array.isArray(value) || typeof value !== "object") {
              isSupported = false;
              messages.push(_BaseFilterTranslator.ErrorMessages.NOT_REQUIRES_OBJECT);
              continue;
            }
            if (this.isEmpty(value)) {
              isSupported = false;
              messages.push(_BaseFilterTranslator.ErrorMessages.NOT_CANNOT_BE_EMPTY);
              continue;
            }
            continue;
          }
          if (path && !this.isLogicalOperator(path.split(".").pop())) {
            isSupported = false;
            messages.push(_BaseFilterTranslator.ErrorMessages.INVALID_LOGICAL_OPERATOR_LOCATION(key, newPath));
            continue;
          }
          if (Array.isArray(value)) {
            const hasDirectOperators = value.some(
              (item) => typeof item === "object" && Object.keys(item).length === 1 && this.isFieldOperator(Object.keys(item)[0])
            );
            if (hasDirectOperators) {
              isSupported = false;
              messages.push(_BaseFilterTranslator.ErrorMessages.INVALID_LOGICAL_OPERATOR_CONTENT(newPath));
              continue;
            }
          }
        }
      }
      const nestedValidation = this.validateFilterSupport(value, newPath);
      if (!nestedValidation.supported) {
        isSupported = false;
        messages.push(...nestedValidation.messages);
      }
    }
    return { supported: isSupported, messages };
  }
};

// src/vector/libsql/filter.ts
var LibSQLFilterTranslator = class extends BaseFilterTranslator {
  getSupportedOperators() {
    return {
      ...BaseFilterTranslator.DEFAULT_OPERATORS,
      regex: [],
      custom: ["$contains", "$size"]
    };
  }
  translate(filter) {
    if (this.isEmpty(filter)) {
      return filter;
    }
    this.validateFilter(filter);
    return this.translateNode(filter);
  }
  translateNode(node, currentPath = "") {
    if (this.isRegex(node)) {
      throw new Error("Direct regex pattern format is not supported in LibSQL");
    }
    const withPath = (result2) => currentPath ? { [currentPath]: result2 } : result2;
    if (this.isPrimitive(node)) {
      return withPath({ $eq: this.normalizeComparisonValue(node) });
    }
    if (Array.isArray(node)) {
      return withPath({ $in: this.normalizeArrayValues(node) });
    }
    const entries = Object.entries(node);
    const result = {};
    for (const [key, value] of entries) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      if (this.isLogicalOperator(key)) {
        result[key] = Array.isArray(value) ? value.map((filter) => this.translateNode(filter)) : this.translateNode(value);
      } else if (this.isOperator(key)) {
        if (this.isArrayOperator(key) && !Array.isArray(value) && key !== "$elemMatch") {
          result[key] = [value];
        } else if (this.isBasicOperator(key) && Array.isArray(value)) {
          result[key] = JSON.stringify(value);
        } else {
          result[key] = value;
        }
      } else if (typeof value === "object" && value !== null) {
        const hasOperators = Object.keys(value).some((k) => this.isOperator(k));
        if (hasOperators) {
          result[newPath] = this.translateNode(value);
        } else {
          Object.assign(result, this.translateNode(value, newPath));
        }
      } else {
        result[newPath] = this.translateNode(value);
      }
    }
    return result;
  }
  // TODO: Look more into regex support for LibSQL
  // private translateRegexPattern(pattern: string, options: string = ''): any {
  //   if (!options) return { $regex: pattern };
  //   const flags = options
  //     .split('')
  //     .filter(f => 'imsux'.includes(f))
  //     .join('');
  //   return {
  //     $regex: pattern,
  //     $options: flags,
  //   };
  // }
};

// src/vector/libsql/sql-builder.ts
var createBasicOperator = (symbol) => {
  return (key, value) => ({
    sql: `CASE 
      WHEN ? IS NULL THEN json_extract(metadata, '$."${handleKey(key)}"') IS ${symbol === "=" ? "" : "NOT"} NULL
      ELSE json_extract(metadata, '$."${handleKey(key)}"') ${symbol} ?
    END`,
    needsValue: true,
    transformValue: () => [value, value]
  });
};
var createNumericOperator = (symbol) => {
  return (key) => ({
    sql: `CAST(json_extract(metadata, '$."${handleKey(key)}"') AS NUMERIC) ${symbol} ?`,
    needsValue: true
  });
};
function buildElemMatchConditions(value) {
  const conditions = Object.entries(value).map(([field, fieldValue]) => {
    if (field.startsWith("$")) {
      const { sql, values } = buildCondition("elem.value", { [field]: fieldValue });
      const pattern = /json_extract\(metadata, '\$\."[^"]*"(\."[^"]*")*'\)/g;
      const elemSql = sql.replace(pattern, "elem.value");
      return { sql: elemSql, values };
    } else if (typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
      const { sql, values } = buildCondition(field, fieldValue);
      const pattern = /json_extract\(metadata, '\$\."[^"]*"(\."[^"]*")*'\)/g;
      const elemSql = sql.replace(pattern, `json_extract(elem.value, '$."${field}"')`);
      return { sql: elemSql, values };
    } else {
      return {
        sql: `json_extract(elem.value, '$."${field}"') = ?`,
        values: [fieldValue]
      };
    }
  });
  return conditions;
}
var validateJsonArray = (key) => `json_valid(json_extract(metadata, '$."${handleKey(key)}"'))
   AND json_type(json_extract(metadata, '$."${handleKey(key)}"')) = 'array'`;
var FILTER_OPERATORS = {
  $eq: createBasicOperator("="),
  $ne: createBasicOperator("!="),
  $gt: createNumericOperator(">"),
  $gte: createNumericOperator(">="),
  $lt: createNumericOperator("<"),
  $lte: createNumericOperator("<="),
  // Array Operators
  $in: (key, value) => {
    const arr = Array.isArray(value) ? value : [value];
    if (arr.length === 0) {
      return { sql: "1 = 0", needsValue: true, transformValue: () => [] };
    }
    const paramPlaceholders = arr.map(() => "?").join(",");
    return {
      sql: `(
      CASE
        WHEN ${validateJsonArray(key)} THEN
          EXISTS (
            SELECT 1 FROM json_each(json_extract(metadata, '$."${handleKey(key)}"')) as elem
            WHERE elem.value IN (SELECT value FROM json_each(?))
          )
        ELSE json_extract(metadata, '$."${handleKey(key)}"') IN (${paramPlaceholders})
      END
    )`,
      needsValue: true,
      transformValue: () => [JSON.stringify(arr), ...arr]
    };
  },
  $nin: (key, value) => {
    const arr = Array.isArray(value) ? value : [value];
    if (arr.length === 0) {
      return { sql: "1 = 1", needsValue: true, transformValue: () => [] };
    }
    const paramPlaceholders = arr.map(() => "?").join(",");
    return {
      sql: `(
      CASE
        WHEN ${validateJsonArray(key)} THEN
          NOT EXISTS (
            SELECT 1 FROM json_each(json_extract(metadata, '$."${handleKey(key)}"')) as elem
            WHERE elem.value IN (SELECT value FROM json_each(?))
          )
        ELSE json_extract(metadata, '$."${handleKey(key)}"') NOT IN (${paramPlaceholders})
      END
    )`,
      needsValue: true,
      transformValue: () => [JSON.stringify(arr), ...arr]
    };
  },
  $all: (key, value) => {
    let sql;
    const arrayValue = Array.isArray(value) ? value : [value];
    if (arrayValue.length === 0) {
      sql = "1 = 0";
    } else {
      sql = `(
      CASE
        WHEN ${validateJsonArray(key)} THEN
          NOT EXISTS (
            SELECT value
            FROM json_each(?)
            WHERE value NOT IN (
              SELECT value
              FROM json_each(json_extract(metadata, '$."${handleKey(key)}"'))
            )
          )
        ELSE FALSE
      END
    )`;
    }
    return {
      sql,
      needsValue: true,
      transformValue: () => {
        if (arrayValue.length === 0) {
          return [];
        }
        return [JSON.stringify(arrayValue)];
      }
    };
  },
  $elemMatch: (key, value) => {
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("$elemMatch requires an object with conditions");
    }
    const conditions = buildElemMatchConditions(value);
    return {
      sql: `(
        CASE
          WHEN ${validateJsonArray(key)} THEN
            EXISTS (
              SELECT 1
              FROM json_each(json_extract(metadata, '$."${handleKey(key)}"')) as elem
              WHERE ${conditions.map((c) => c.sql).join(" AND ")}
            )
          ELSE FALSE
        END
      )`,
      needsValue: true,
      transformValue: () => conditions.flatMap((c) => c.values)
    };
  },
  // Element Operators
  $exists: (key) => ({
    sql: `json_extract(metadata, '$."${handleKey(key)}"') IS NOT NULL`,
    needsValue: false
  }),
  // Logical Operators
  $and: (key) => ({
    sql: `(${key})`,
    needsValue: false
  }),
  $or: (key) => ({
    sql: `(${key})`,
    needsValue: false
  }),
  $not: (key) => ({ sql: `NOT (${key})`, needsValue: false }),
  $nor: (key) => ({
    sql: `NOT (${key})`,
    needsValue: false
  }),
  $size: (key, paramIndex) => ({
    sql: `(
    CASE
      WHEN json_type(json_extract(metadata, '$."${handleKey(key)}"')) = 'array' THEN 
        json_array_length(json_extract(metadata, '$."${handleKey(key)}"')) = $${paramIndex}
      ELSE FALSE
    END
  )`,
    needsValue: true
  }),
  //   /**
  //    * Regex Operators
  //    * Supports case insensitive and multiline
  //    */
  //   $regex: (key: string): FilterOperator => ({
  //     sql: `json_extract(metadata, '$."${handleKey(key)}"') = ?`,
  //     needsValue: true,
  //     transformValue: (value: any) => {
  //       const pattern = typeof value === 'object' ? value.$regex : value;
  //       const options = typeof value === 'object' ? value.$options || '' : '';
  //       let sql = `json_extract(metadata, '$."${handleKey(key)}"')`;
  //       // Handle multiline
  //       //   if (options.includes('m')) {
  //       //     sql = `REPLACE(${sql}, CHAR(10), '\n')`;
  //       //   }
  //       //       let finalPattern = pattern;
  //       // if (options) {
  //       //   finalPattern = `(\\?${options})${pattern}`;
  //       // }
  //       //   // Handle case insensitivity
  //       //   if (options.includes('i')) {
  //       //     sql = `LOWER(${sql}) REGEXP LOWER(?)`;
  //       //   } else {
  //       //     sql = `${sql} REGEXP ?`;
  //       //   }
  //       if (options.includes('m')) {
  //         sql = `EXISTS (
  //         SELECT 1
  //         FROM json_each(
  //           json_array(
  //             ${sql},
  //             REPLACE(${sql}, CHAR(10), CHAR(13))
  //           )
  //         ) as lines
  //         WHERE lines.value REGEXP ?
  //       )`;
  //       } else {
  //         sql = `${sql} REGEXP ?`;
  //       }
  //       // Handle case insensitivity
  //       if (options.includes('i')) {
  //         sql = sql.replace('REGEXP ?', 'REGEXP LOWER(?)');
  //         sql = sql.replace('value REGEXP', 'LOWER(value) REGEXP');
  //       }
  //       // Handle extended - allows whitespace and comments in pattern
  //       if (options.includes('x')) {
  //         // Remove whitespace and comments from pattern
  //         const cleanPattern = pattern.replace(/\s+|#.*$/gm, '');
  //         return {
  //           sql,
  //           values: [cleanPattern],
  //         };
  //       }
  //       return {
  //         sql,
  //         values: [pattern],
  //       };
  //     },
  //   }),
  $contains: (key, value) => {
    let sql;
    if (Array.isArray(value)) {
      sql = `(
        SELECT ${validateJsonArray(key)}
        AND EXISTS (
          SELECT 1
          FROM json_each(json_extract(metadata, '$."${handleKey(key)}"')) as m
          WHERE m.value IN (SELECT value FROM json_each(?))
        )
      )`;
    } else if (typeof value === "string") {
      sql = `lower(json_extract(metadata, '$."${handleKey(key)}"')) LIKE '%' || lower(?) || '%'`;
    } else {
      sql = `json_extract(metadata, '$."${handleKey(key)}"') = ?`;
    }
    return {
      sql,
      needsValue: true,
      transformValue: () => {
        if (Array.isArray(value)) {
          return [JSON.stringify(value)];
        }
        if (typeof value === "object" && value !== null) {
          return [JSON.stringify(value)];
        }
        return [value];
      }
    };
  }
  /**
   * $objectContains: True JSON containment for advanced use (deep sub-object match).
   * Usage: { field: { $objectContains: { ...subobject } } }
   */
  // $objectContains: (key: string) => ({
  //   sql: '', // Will be overridden by transformValue
  //   needsValue: true,
  //   transformValue: (value: any) => ({
  //     sql: `json_type(json_extract(metadata, '$."${handleKey(key)}"')) = 'object'
  //         AND json_patch(json_extract(metadata, '$."${handleKey(key)}"'), ?) = json_extract(metadata, '$."${handleKey(key)}"')`,
  //     values: [JSON.stringify(value)],
  //   }),
  // }),
};
var handleKey = (key) => {
  return key.replace(/\./g, '"."');
};
function buildFilterQuery(filter) {
  if (!filter) {
    return { sql: "", values: [] };
  }
  const values = [];
  const conditions = Object.entries(filter).map(([key, value]) => {
    const condition = buildCondition(key, value);
    values.push(...condition.values);
    return condition.sql;
  }).join(" AND ");
  return {
    sql: conditions ? `WHERE ${conditions}` : "",
    values
  };
}
function buildCondition(key, value, parentPath) {
  if (["$and", "$or", "$not", "$nor"].includes(key)) {
    return handleLogicalOperator(key, value);
  }
  if (!value || typeof value !== "object") {
    return {
      sql: `json_extract(metadata, '$."${key.replace(/\./g, '"."')}"') = ?`,
      values: [value]
    };
  }
  return handleOperator(key, value);
}
function handleLogicalOperator(key, value, parentPath) {
  if (!value || value.length === 0) {
    switch (key) {
      case "$and":
      case "$nor":
        return { sql: "true", values: [] };
      case "$or":
        return { sql: "false", values: [] };
      case "$not":
        throw new Error("$not operator cannot be empty");
      default:
        return { sql: "true", values: [] };
    }
  }
  if (key === "$not") {
    const entries = Object.entries(value);
    const conditions2 = entries.map(([fieldKey, fieldValue]) => buildCondition(fieldKey, fieldValue));
    return {
      sql: `NOT (${conditions2.map((c) => c.sql).join(" AND ")})`,
      values: conditions2.flatMap((c) => c.values)
    };
  }
  const values = [];
  const joinOperator = key === "$or" || key === "$nor" ? "OR" : "AND";
  const conditions = Array.isArray(value) ? value.map((f) => {
    const entries = Object.entries(f);
    return entries.map(([k, v]) => buildCondition(k, v));
  }) : [buildCondition(key, value)];
  const joined = conditions.flat().map((c) => {
    values.push(...c.values);
    return c.sql;
  }).join(` ${joinOperator} `);
  return {
    sql: key === "$nor" ? `NOT (${joined})` : `(${joined})`,
    values
  };
}
function handleOperator(key, value) {
  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    const results = entries.map(
      ([operator2, operatorValue2]) => operator2 === "$not" ? {
        sql: `NOT (${Object.entries(operatorValue2).map(([op, val]) => processOperator(key, op, val).sql).join(" AND ")})`,
        values: Object.entries(operatorValue2).flatMap(
          ([op, val]) => processOperator(key, op, val).values
        )
      } : processOperator(key, operator2, operatorValue2)
    );
    return {
      sql: `(${results.map((r) => r.sql).join(" AND ")})`,
      values: results.flatMap((r) => r.values)
    };
  }
  const [[operator, operatorValue] = []] = Object.entries(value);
  return processOperator(key, operator, operatorValue);
}
var processOperator = (key, operator, operatorValue) => {
  if (!operator.startsWith("$") || !FILTER_OPERATORS[operator]) {
    throw new Error(`Invalid operator: ${operator}`);
  }
  const operatorFn = FILTER_OPERATORS[operator];
  const operatorResult = operatorFn(key, operatorValue);
  if (!operatorResult.needsValue) {
    return { sql: operatorResult.sql, values: [] };
  }
  const transformed = operatorResult.transformValue ? operatorResult.transformValue() : operatorValue;
  return {
    sql: operatorResult.sql,
    values: Array.isArray(transformed) ? transformed : [transformed]
  };
};

// src/vector/libsql/index.ts
var LibSQLVector = class extends MastraVector {
  turso;
  constructor({
    connectionUrl,
    authToken,
    syncUrl,
    syncInterval
  }) {
    super();
    this.turso = createClient({
      url: this.rewriteDbUrl(connectionUrl),
      syncUrl,
      authToken,
      syncInterval
    });
    if (connectionUrl.includes(`file:`) || connectionUrl.includes(`:memory:`)) {
      void this.turso.execute({
        sql: "PRAGMA journal_mode=WAL;",
        args: {}
      });
    }
  }
  // If we're in the .mastra/output directory, use the dir outside .mastra dir
  // reason we need to do this is libsql relative file paths are based on cwd, not current file path
  // since mastra dev sets cwd to .mastra/output this means running an agent directly vs running with mastra dev
  // will put db files in different locations, leading to an inconsistent experience between the two.
  // Ex: with `file:ex.db`
  // 1. `mastra dev`: ${cwd}/.mastra/output/ex.db
  // 2. `tsx src/index.ts`: ${cwd}/ex.db
  // so if we're in .mastra/output we need to rewrite the file url to be relative to the project root dir
  // or the experience will be inconsistent
  // this means `file:` urls are always relative to project root
  // TODO: can we make this easier via bundling? https://github.com/mastra-ai/mastra/pull/2783#pullrequestreview-2662444241
  rewriteDbUrl(url) {
    if (url.startsWith("file:")) {
      const pathPart = url.slice("file:".length);
      if (isAbsolute(pathPart)) {
        return url;
      }
      const cwd = process.cwd();
      if (cwd.includes(".mastra") && (cwd.endsWith(`output`) || cwd.endsWith(`output/`) || cwd.endsWith(`output\\`))) {
        const baseDir = join(cwd, `..`, `..`);
        const fullPath = resolve(baseDir, pathPart);
        this.logger.debug(
          `Initializing LibSQL db with url ${url} with relative file path from inside .mastra/output directory. Rewriting relative file url to "file:${fullPath}". This ensures it's outside the .mastra/output directory.`
        );
        return `file:${fullPath}`;
      }
    }
    return url;
  }
  transformFilter(filter) {
    const translator = new LibSQLFilterTranslator();
    return translator.translate(filter);
  }
  async query(...args) {
    const params = this.normalizeArgs("query", args, ["minScore"]);
    try {
      const { indexName, queryVector, topK = 10, filter, includeVector = false, minScore = 0 } = params;
      const vectorStr = `[${queryVector.join(",")}]`;
      const translatedFilter = this.transformFilter(filter);
      const { sql: filterQuery, values: filterValues } = buildFilterQuery(translatedFilter);
      filterValues.push(minScore);
      const query = `
        WITH vector_scores AS (
          SELECT
            vector_id as id,
            (1-vector_distance_cos(embedding, '${vectorStr}')) as score,
            metadata
            ${includeVector ? ", vector_extract(embedding) as embedding" : ""}
          FROM ${indexName}
          ${filterQuery}
        )
        SELECT *
        FROM vector_scores
        WHERE score > ?
        ORDER BY score DESC
        LIMIT ${topK}`;
      const result = await this.turso.execute({
        sql: query,
        args: filterValues
      });
      return result.rows.map(({ id, score, metadata, embedding }) => ({
        id,
        score,
        metadata: JSON.parse(metadata ?? "{}"),
        ...includeVector && embedding && { vector: JSON.parse(embedding) }
      }));
    } finally {
    }
  }
  async upsert(...args) {
    const params = this.normalizeArgs("upsert", args);
    const { indexName, vectors, metadata, ids } = params;
    const tx = await this.turso.transaction("write");
    try {
      const vectorIds = ids || vectors.map(() => crypto.randomUUID());
      for (let i = 0; i < vectors.length; i++) {
        const query = `
          INSERT INTO ${indexName} (vector_id, embedding, metadata)
          VALUES (?, vector32(?), ?)
          ON CONFLICT(vector_id) DO UPDATE SET
            embedding = vector32(?),
            metadata = ?
        `;
        await tx.execute({
          sql: query,
          // @ts-ignore
          args: [
            vectorIds[i],
            JSON.stringify(vectors[i]),
            JSON.stringify(metadata?.[i] || {}),
            JSON.stringify(vectors[i]),
            JSON.stringify(metadata?.[i] || {})
          ]
        });
      }
      await tx.commit();
      return vectorIds;
    } catch (error) {
      await tx.rollback();
      if (error instanceof Error && error.message?.includes("dimensions are different")) {
        const match = error.message.match(/dimensions are different: (\d+) != (\d+)/);
        if (match) {
          const [, actual, expected] = match;
          throw new Error(
            `Vector dimension mismatch: Index "${indexName}" expects ${expected} dimensions but got ${actual} dimensions. Either use a matching embedding model or delete and recreate the index with the new dimension.`
          );
        }
      }
      throw error;
    }
  }
  async createIndex(...args) {
    const params = this.normalizeArgs("createIndex", args);
    const { indexName, dimension } = params;
    try {
      if (!indexName.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        throw new Error("Invalid index name format");
      }
      if (!Number.isInteger(dimension) || dimension <= 0) {
        throw new Error("Dimension must be a positive integer");
      }
      await this.turso.execute({
        sql: `
        CREATE TABLE IF NOT EXISTS ${indexName} (
          id SERIAL PRIMARY KEY,
          vector_id TEXT UNIQUE NOT NULL,
          embedding F32_BLOB(${dimension}),
          metadata TEXT DEFAULT '{}'
        );
      `,
        args: []
      });
      await this.turso.execute({
        sql: `
        CREATE INDEX IF NOT EXISTS ${indexName}_vector_idx
        ON ${indexName} (libsql_vector_idx(embedding))
      `,
        args: []
      });
    } catch (error) {
      console.error("Failed to create vector table:", error);
      throw error;
    } finally {
    }
  }
  async deleteIndex(indexName) {
    try {
      await this.turso.execute({
        sql: `DROP TABLE IF EXISTS ${indexName}`,
        args: []
      });
    } catch (error) {
      console.error("Failed to delete vector table:", error);
      throw new Error(`Failed to delete vector table: ${error.message}`);
    } finally {
    }
  }
  async listIndexes() {
    try {
      const vectorTablesQuery = `
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND sql LIKE '%F32_BLOB%';
      `;
      const result = await this.turso.execute({
        sql: vectorTablesQuery,
        args: []
      });
      return result.rows.map((row) => row.name);
    } catch (error) {
      throw new Error(`Failed to list vector tables: ${error.message}`);
    }
  }
  async describeIndex(indexName) {
    try {
      const tableInfoQuery = `
        SELECT sql 
        FROM sqlite_master 
        WHERE type='table' 
        AND name = ?;
      `;
      const tableInfo = await this.turso.execute({
        sql: tableInfoQuery,
        args: [indexName]
      });
      if (!tableInfo.rows[0]?.sql) {
        throw new Error(`Table ${indexName} not found`);
      }
      const dimension = parseInt(tableInfo.rows[0].sql.match(/F32_BLOB\((\d+)\)/)?.[1] || "0");
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${indexName};
      `;
      const countResult = await this.turso.execute({
        sql: countQuery,
        args: []
      });
      const metric = "cosine";
      return {
        dimension,
        count: countResult?.rows?.[0]?.count ?? 0,
        metric
      };
    } catch (e) {
      throw new Error(`Failed to describe vector table: ${e.message}`);
    }
  }
  /**
   * @deprecated Use {@link updateVector} instead. This method will be removed on May 20th, 2025.
   *
   * Updates a vector by its ID with the provided vector and/or metadata.
   * @param indexName - The name of the index containing the vector.
   * @param id - The ID of the vector to update.
   * @param update - An object containing the vector and/or metadata to update.
   * @param update.vector - An optional array of numbers representing the new vector.
   * @param update.metadata - An optional record containing the new metadata.
   * @returns A promise that resolves when the update is complete.
   * @throws Will throw an error if no updates are provided or if the update operation fails.
   */
  async updateIndexById(indexName, id, update) {
    this.logger.warn(
      `Deprecation Warning: updateIndexById() is deprecated. Please use updateVector() instead. updateIndexById() will be removed on May 20th, 2025.`
    );
    await this.updateVector(indexName, id, update);
  }
  /**
   * Updates a vector by its ID with the provided vector and/or metadata.
   *
   * @param indexName - The name of the index containing the vector.
   * @param id - The ID of the vector to update.
   * @param update - An object containing the vector and/or metadata to update.
   * @param update.vector - An optional array of numbers representing the new vector.
   * @param update.metadata - An optional record containing the new metadata.
   * @returns A promise that resolves when the update is complete.
   * @throws Will throw an error if no updates are provided or if the update operation fails.
   */
  async updateVector(indexName, id, update) {
    try {
      const updates = [];
      const args = [];
      if (update.vector) {
        updates.push("embedding = vector32(?)");
        args.push(JSON.stringify(update.vector));
      }
      if (update.metadata) {
        updates.push("metadata = ?");
        args.push(JSON.stringify(update.metadata));
      }
      if (updates.length === 0) {
        throw new Error("No updates provided");
      }
      args.push(id);
      const query = `
        UPDATE ${indexName}
        SET ${updates.join(", ")}
        WHERE vector_id = ?;
      `;
      await this.turso.execute({
        sql: query,
        args
      });
    } catch (error) {
      throw new Error(`Failed to update vector by id: ${id} for index: ${indexName}: ${error.message}`);
    }
  }
  /**
   * @deprecated Use {@link deleteVector} instead. This method will be removed on May 20th, 2025.
   *
   * Deletes a vector by its ID.
   * @param indexName - The name of the index containing the vector.
   * @param id - The ID of the vector to delete.
   * @returns A promise that resolves when the deletion is complete.
   * @throws Will throw an error if the deletion operation fails.
   */
  async deleteIndexById(indexName, id) {
    this.logger.warn(
      `Deprecation Warning: deleteIndexById() is deprecated. 
      Please use deleteVector() instead. 
      deleteIndexById() will be removed on May 20th, 2025.`
    );
    await this.deleteVector(indexName, id);
  }
  /**
   * Deletes a vector by its ID.
   * @param indexName - The name of the index containing the vector.
   * @param id - The ID of the vector to delete.
   * @returns A promise that resolves when the deletion is complete.
   * @throws Will throw an error if the deletion operation fails.
   */
  async deleteVector(indexName, id) {
    try {
      await this.turso.execute({
        sql: `DELETE FROM ${indexName} WHERE vector_id = ?`,
        args: [id]
      });
    } catch (error) {
      throw new Error(`Failed to delete vector by id: ${id} for index: ${indexName}: ${error.message}`);
    }
  }
  async truncateIndex(indexName) {
    await this.turso.execute({
      sql: `DELETE FROM ${indexName}`,
      args: []
    });
  }
};

async function getModelCachePath() {
  const cachePath = path.join(os.homedir(), ".cache", "mastra", "fastembed-models");
  await fsp.mkdir(cachePath, { recursive: true });
  return cachePath;
}
function unbundleableImport(name) {
  const nonStaticallyAnalyzableName = `${name}?d=${Date.now()}`;
  return import(nonStaticallyAnalyzableName.split(`?`)[0]);
}
async function generateEmbeddings(values, modelType) {
  try {
    let mod;
    const importErrors = [];
    {
      try {
        mod = await unbundleableImport("fastembed");
      } catch (e) {
        if (e instanceof Error) {
          importErrors.push(e);
        } else {
          throw e;
        }
      }
    }
    if (!mod) {
      throw new Error(`${importErrors.map((e) => e.message).join(`
`)}

This runtime does not support fastembed-js, which is the default embedder in Mastra. 
Scroll up to read import errors. These errors mean you can't use the default Mastra embedder on this hosting platform.
You can either use Mastra Cloud which supports the default embedder, or you can configure an alternate provider.

For example if you're using Memory:

import { openai } from "@ai-sdk/openai";

const memory = new Memory({
  embedder: openai.embedding("text-embedding-3-small"), // <- doesn't have to be openai
})

Visit https://sdk.vercel.ai/docs/foundations/overview#embedding-models to find an alternate embedding provider

If you do not want to use the Memory semantic recall feature, you can disable it entirely and this error will go away.

const memory = new Memory({
  options: {
    semanticRecall: false // <- an embedder will not be required with this set to false
  }
})
`);
    }
    const { FlagEmbedding, EmbeddingModel } = mod;
    const model = await FlagEmbedding.init({
      model: EmbeddingModel[modelType],
      cacheDir: await getModelCachePath()
    });
    const embeddings = await model.embed(values);
    const allResults = [];
    for await (const result of embeddings) {
      allResults.push(...result.map((embedding) => Array.from(embedding)));
    }
    if (allResults.length === 0) throw new Error("No embeddings generated");
    return {
      embeddings: allResults
    };
  } catch (error) {
    console.error("Error generating embeddings:", error);
    throw error;
  }
}
var fastEmbedProvider = experimental_customProvider({
  textEmbeddingModels: {
    "bge-small-en-v1.5": {
      specificationVersion: "v1",
      provider: "fastembed",
      modelId: "bge-small-en-v1.5",
      maxEmbeddingsPerCall: 256,
      supportsParallelCalls: true,
      async doEmbed({ values }) {
        return generateEmbeddings(values, "BGESmallENV15");
      }
    },
    "bge-base-en-v1.5": {
      specificationVersion: "v1",
      provider: "fastembed",
      modelId: "bge-base-en-v1.5",
      maxEmbeddingsPerCall: 256,
      supportsParallelCalls: true,
      async doEmbed({ values }) {
        return generateEmbeddings(values, "BGEBaseENV15");
      }
    }
  }
});
var defaultEmbedder = fastEmbedProvider.textEmbeddingModel;
var memoryDefaultOptions = {
  lastMessages: 40,
  semanticRecall: {
    topK: 2,
    messageRange: {
      before: 2,
      after: 2
    }
  },
  threads: {
    generateTitle: true
  },
  workingMemory: {
    use: "text-stream",
    // will be deprecated, use 'tool-call' instead
    enabled: false,
    template: `
# User Information
- **First Name**: 
- **Last Name**: 
- **Location**: 
- **Occupation**: 
- **Interests**: 
- **Goals**: 
- **Events**: 
- **Facts**: 
- **Projects**: 
`
  }
};
var newMemoryDefaultOptions = {
  lastMessages: 10,
  semanticRecall: false,
  threads: {
    generateTitle: false
  },
  workingMemory: {
    // new
    use: "tool-call"}
};
var MastraMemory = class extends MastraBase {
  MAX_CONTEXT_TOKENS;
  storage;
  vector;
  embedder;
  processors = [];
  deprecationWarnings = [];
  threadConfig = { ...memoryDefaultOptions };
  constructor(config) {
    super({ component: "MEMORY", name: config.name });
    if (config.options) {
      this.threadConfig = this.getMergedThreadConfig(config.options);
    }
    const hasRootMemoryDbFile = existsSync(join(process.cwd(), `memory.db`));
    const hasParentMemoryDbFile = existsSync(join(process.cwd(), `..`, `..`, `memory.db`));
    const suggestDbPath = hasRootMemoryDbFile || hasParentMemoryDbFile ? `file:${hasParentMemoryDbFile ? `../../` : ``}memory.db` : `file:../mastra.db`;
    if (config.storage) {
      this.storage = config.storage;
    } else {
      this.storage = new DefaultProxyStorage({
        config: {
          url: "file:memory.db"
        }
      });
      this.deprecationWarnings.push(`
Default storage is deprecated in Mastra Memory.
You're using it as an implicit default by not setting a storage adapter.

In the May 20th breaking change the default store will be removed.

Instead of this:
export const agent = new Agent({
  memory: new Memory({
    // your config
  })
})

Do this:
import { LibSQLStore } from '@mastra/libsql';

export const agent = new Agent({
  memory: new Memory({
    // your config
    storage: new LibSQLStore({
      url: '${suggestDbPath}' // relative path from bundled .mastra/output dir
    })
  })
})

Additionally, in the breaking release, Memory will inherit storage from the Mastra instance.
If you plan on using that feature you can prepare by setting the same storage instance on Mastra and Memory.

Ex:
// mastra/storage.ts
export const storage = new LibSQLStore({
  url: '${suggestDbPath}'
})

// mastra/index.ts
import { storage } from "./storage"
export const mastra = new Mastra({
  // your config
  storage
})

// mastra/agents/index.ts
import { storage } from "../storage"
export const yourAgent = new Agent({
  // your config
  storage
})
`);
    }
    this.storage = augmentWithInit(this.storage);
    const semanticRecallIsEnabled = this.threadConfig.semanticRecall !== false;
    if (config.vector && semanticRecallIsEnabled) {
      this.vector = config.vector;
    } else if (
      // if there's no configured vector store
      // and the vector store hasn't been explicitly disabled with vector: false
      config.vector !== false && // and semanticRecall is enabled
      semanticRecallIsEnabled
    ) {
      const oldDb = "memory-vector.db";
      const hasOldDb = existsSync(join(process.cwd(), oldDb)) || existsSync(join(process.cwd(), ".mastra", oldDb));
      const newDb = "memory.db";
      if (hasOldDb) {
        this.deprecationWarnings.push(
          `Found deprecated Memory vector db file ${oldDb}. In the May 20th breaking change, this will no longer be used by default. This db is now merged with the default storage file (${newDb}). You will need to manually migrate any data from ${oldDb} to ${newDb} if it's important to you. For now the deprecated path will be used, but in the May 20th breaking change we will only use the new db file path.`
        );
      }
      this.deprecationWarnings.push(`
Default vector storage is deprecated in Mastra Memory.
You're using it as an implicit default by not setting a vector store.

In the May 20th breaking change the default vector store will be removed.

Instead of this:
export const agent = new Agent({
  memory: new Memory({
    options: { semanticRecall: true }
  })
})

Do this:
import { LibSQLVector } from '@mastra/libsql';

export const agent = new Agent({
  memory: new Memory({
    options: { semanticRecall: true },
    vector: new LibSQLVector({
      connectionUrl: '${suggestDbPath}' // relative path from bundled .mastra/output dir
    })
  })
})
`);
      this.vector = new LibSQLVector({
        // TODO: MAY 20th BREAKING CHANGE: remove this default and throw an error if semantic recall is enabled but there's no vector db
        connectionUrl: hasOldDb ? `file:${oldDb}` : `file:${newDb}`
      });
    }
    if (config.embedder) {
      this.embedder = config.embedder;
    } else if (
      // if there's no configured embedder
      // and there's a vector store
      typeof this.vector !== `undefined` && // and semanticRecall is enabled
      semanticRecallIsEnabled
    ) {
      this.deprecationWarnings.push(`
The default embedder (FastEmbed) is deprecated in Mastra Memory.
You're using it as an implicit default by not configuring an embedder.

On May 20th there will be a breaking change and the default embedder will be removed from @mastra/core.

To continue using FastEmbed, install the dedicated package:
pnpm add @mastra/fastembed

Then configure it in your Memory setup:

import { fastembed } from '@mastra/fastembed';

export const agent = new Agent({
  memory: new Memory({
    embedder: fastembed, // Configure the embedder
    // your other config
  })
})

Alternatively, you can use a different embedder, like OpenAI:
import { openai } from '@ai-sdk/openai';

export const agent = new Agent({
  memory: new Memory({
    embedder: openai.embedding('text-embedding-3-small'),
    // your other config
  })
})

--> This breaking change will be released on May 20th <--
`);
      this.embedder = defaultEmbedder("bge-small-en-v1.5");
    }
    if (config.processors) {
      this.processors = config.processors;
    }
    this.addImplicitDefaultsWarning(config);
    if (this.deprecationWarnings.length > 0) {
      setTimeout(() => {
        this.logger?.warn(`

!MEMORY DEPRECATION WARNING!
${this.deprecationWarnings.map((w, i) => `${this.deprecationWarnings.length > 1 ? `Warning ${i + 1}:
` : ``}${w}`).join(`

`)}
!END MEMORY DEPRECATION WARNING!

`);
      }, 1e3);
    }
  }
  // We're changing the implicit defaults from memoryDefaultOptions to newMemoryDefaultOptions so we need to log and let people know
  addImplicitDefaultsWarning(config) {
    const fromToPairs = [];
    const indent = (s) => s.split(`
`).join(`
    `);
    const format = (v) => typeof v === `object` && !Array.isArray(v) && v !== null ? indent(JSON.stringify(v, null, 2).replaceAll(`"`, ``)) : v;
    const options = config.options ?? {};
    if (!(`lastMessages` in options))
      fromToPairs.push({
        key: "lastMessages",
        from: memoryDefaultOptions.lastMessages,
        to: newMemoryDefaultOptions.lastMessages
      });
    if (!(`semanticRecall` in options))
      fromToPairs.push({
        key: "semanticRecall",
        from: memoryDefaultOptions.semanticRecall,
        to: newMemoryDefaultOptions.semanticRecall
      });
    if (!(`threads` in options))
      fromToPairs.push({
        key: "threads",
        from: memoryDefaultOptions.threads,
        to: newMemoryDefaultOptions.threads
      });
    if (`workingMemory` in options && // special handling for working memory since it's disabled by default and users should only care about the change if they're using
    options.workingMemory?.enabled === true && options.workingMemory?.use !== `tool-call`) {
      fromToPairs.push({
        key: "workingMemory",
        from: {
          use: memoryDefaultOptions.workingMemory.use
        },
        to: {
          use: newMemoryDefaultOptions.workingMemory.use
        },
        message: `
Also, the text-stream output mode (which is the current default) will be fully removed in an upcoming breaking change. Please update your code to use the newer "use: 'tool-call'" setting instead.
`
      });
    }
    if (fromToPairs.length > 0) {
      const currentDefaults = `{
  options: {
    ${fromToPairs.map(({ key, from }) => `${key}: ${format(from)}`).join(`,
    `)}
  }
}`;
      const upcomingDefaults = `{
  options: {
    ${fromToPairs.map(({ key, to }) => `${key}: ${format(to)}`).join(`,
    `)}
  }
}`;
      const messages = fromToPairs.filter((ft) => ft.message);
      this.deprecationWarnings.push(`
Your Mastra memory instance has the
following implicit default options:

new Memory(${currentDefaults})

In the next release these implicit defaults
will be changed to the following default settings:

new Memory(${upcomingDefaults})

To keep your defaults as they are, add
them directly into your Memory configuration,
otherwise please add the new settings to
your memory config to prepare for the change.
${messages.length ? messages.map((ft) => ft.message).join(`
`) : ``}
--> This breaking change will be released on May 20th <--
`);
    }
  }
  setStorage(storage) {
    if (storage instanceof DefaultProxyStorage) {
      this.deprecationWarnings.push(`Importing "DefaultStorage" from '@mastra/core/storage/libsql' is deprecated.

Instead of:
  import { DefaultStorage } from '@mastra/core/storage/libsql';

Do:
  import { LibSQLStore } from '@mastra/libsql';
`);
    }
    this.storage = storage;
  }
  setVector(vector) {
    this.vector = vector;
  }
  setEmbedder(embedder) {
    this.embedder = embedder;
  }
  /**
   * Get a system message to inject into the conversation.
   * This will be called before each conversation turn.
   * Implementations can override this to inject custom system messages.
   */
  async getSystemMessage(_input) {
    return null;
  }
  /**
   * Get tools that should be available to the agent.
   * This will be called when converting tools for the agent.
   * Implementations can override this to provide additional tools.
   */
  getTools(_config) {
    return {};
  }
  async createEmbeddingIndex(dimensions) {
    const defaultDimensions = 1536;
    const isDefault = dimensions === defaultDimensions;
    const usedDimensions = dimensions ?? defaultDimensions;
    const separator = this.vector?.indexSeparator ?? "_";
    const indexName = isDefault ? `memory${separator}messages` : `memory${separator}messages${separator}${usedDimensions}`;
    if (typeof this.vector === `undefined`) {
      throw new Error(`Tried to create embedding index but no vector db is attached to this Memory instance.`);
    }
    await this.vector.createIndex({
      indexName,
      dimension: usedDimensions
    });
    return { indexName };
  }
  getMergedThreadConfig(config) {
    return deepMerge(this.threadConfig, config || {});
  }
  /**
   * Apply all configured message processors to a list of messages.
   * @param messages The messages to process
   * @returns The processed messages
   */
  applyProcessors(messages, opts) {
    const processors = opts.processors || this.processors;
    if (!processors || processors.length === 0) {
      return messages;
    }
    let processedMessages = [...messages];
    for (const processor of processors) {
      processedMessages = processor.process(processedMessages, {
        systemMessage: opts.systemMessage,
        newMessages: opts.newMessages,
        memorySystemMessage: opts.memorySystemMessage
      });
    }
    return processedMessages;
  }
  processMessages({
    messages,
    processors,
    ...opts
  }) {
    return this.applyProcessors(messages, { processors: processors || this.processors, ...opts });
  }
  estimateTokens(text) {
    return Math.ceil(text.split(" ").length * 1.3);
  }
  parseMessages(messages) {
    return messages.map((msg) => {
      let content = msg.content;
      if (typeof content === "string" && (content.startsWith("[") || content.startsWith("{"))) {
        try {
          content = JSON.parse(content);
        } catch {
        }
      } else if (typeof content === "number") {
        content = String(content);
      }
      return {
        ...msg,
        content
      };
    });
  }
  convertToUIMessages(messages) {
    function addToolMessageToChat({
      toolMessage,
      messages: messages2,
      toolResultContents
    }) {
      const chatMessages2 = messages2.map((message) => {
        if (message.toolInvocations) {
          return {
            ...message,
            toolInvocations: message.toolInvocations.map((toolInvocation) => {
              const toolResult = toolMessage.content.find((tool) => tool.toolCallId === toolInvocation.toolCallId);
              if (toolResult) {
                return {
                  ...toolInvocation,
                  state: "result",
                  result: toolResult.result
                };
              }
              return toolInvocation;
            })
          };
        }
        return message;
      });
      const resultContents = [...toolResultContents, ...toolMessage.content];
      return { chatMessages: chatMessages2, toolResultContents: resultContents };
    }
    const { chatMessages } = messages.reduce(
      (obj, message) => {
        if (message.role === "tool") {
          return addToolMessageToChat({
            toolMessage: message,
            messages: obj.chatMessages,
            toolResultContents: obj.toolResultContents
          });
        }
        let textContent = "";
        let toolInvocations = [];
        if (typeof message.content === "string") {
          textContent = message.content;
        } else if (typeof message.content === "number") {
          textContent = String(message.content);
        } else if (Array.isArray(message.content)) {
          for (const content of message.content) {
            if (content.type === "text") {
              textContent += content.text;
            } else if (content.type === "tool-call") {
              const toolResult = obj.toolResultContents.find((tool) => tool.toolCallId === content.toolCallId);
              toolInvocations.push({
                state: toolResult ? "result" : "call",
                toolCallId: content.toolCallId,
                toolName: content.toolName,
                args: content.args,
                result: toolResult?.result
              });
            }
          }
        }
        obj.chatMessages.push({
          id: message.id,
          role: message.role,
          content: textContent,
          toolInvocations,
          createdAt: message.createdAt
        });
        return obj;
      },
      { chatMessages: [], toolResultContents: [] }
    );
    return chatMessages;
  }
  /**
   * Helper method to create a new thread
   * @param title - Optional title for the thread
   * @param metadata - Optional metadata for the thread
   * @returns Promise resolving to the created thread
   */
  async createThread({
    threadId,
    resourceId,
    title,
    metadata,
    memoryConfig
  }) {
    const thread = {
      id: threadId || this.generateId(),
      title: title || `New Thread ${(/* @__PURE__ */ new Date()).toISOString()}`,
      resourceId,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date(),
      metadata
    };
    return this.saveThread({ thread, memoryConfig });
  }
  /**
   * Helper method to add a single message to a thread
   * @param threadId - The thread to add the message to
   * @param content - The message content
   * @param role - The role of the message sender
   * @param type - The type of the message
   * @param toolNames - Optional array of tool names that were called
   * @param toolCallArgs - Optional array of tool call arguments
   * @param toolCallIds - Optional array of tool call ids
   * @returns Promise resolving to the saved message
   */
  async addMessage({
    threadId,
    resourceId,
    config,
    content,
    role,
    type,
    toolNames,
    toolCallArgs,
    toolCallIds
  }) {
    const message = {
      id: this.generateId(),
      content,
      role,
      createdAt: /* @__PURE__ */ new Date(),
      threadId,
      resourceId,
      type,
      toolNames,
      toolCallArgs,
      toolCallIds
    };
    const savedMessages = await this.saveMessages({ messages: [message], memoryConfig: config });
    return savedMessages[0];
  }
  /**
   * Generates a unique identifier
   * @returns A unique string ID
   */
  generateId() {
    return crypto.randomUUID();
  }
};

const t=new Uint8Array([0,97,115,109,1,0,0,0,1,48,8,96,3,127,127,127,1,127,96,3,127,127,127,0,96,2,127,127,0,96,1,127,1,127,96,3,127,127,126,1,126,96,3,126,127,127,1,126,96,2,127,126,0,96,1,127,1,126,3,11,10,0,0,2,1,3,4,5,6,1,7,5,3,1,0,1,7,85,9,3,109,101,109,2,0,5,120,120,104,51,50,0,0,6,105,110,105,116,51,50,0,2,8,117,112,100,97,116,101,51,50,0,3,8,100,105,103,101,115,116,51,50,0,4,5,120,120,104,54,52,0,5,6,105,110,105,116,54,52,0,7,8,117,112,100,97,116,101,54,52,0,8,8,100,105,103,101,115,116,54,52,0,9,10,251,22,10,242,1,1,4,127,32,0,32,1,106,33,3,32,1,65,16,79,4,127,32,3,65,16,107,33,6,32,2,65,168,136,141,161,2,106,33,3,32,2,65,137,235,208,208,7,107,33,4,32,2,65,207,140,162,142,6,106,33,5,3,64,32,3,32,0,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,3,32,4,32,0,65,4,106,34,0,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,4,32,2,32,0,65,4,106,34,0,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,2,32,5,32,0,65,4,106,34,0,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,5,32,6,32,0,65,4,106,34,0,79,13,0,11,32,2,65,12,119,32,5,65,18,119,106,32,4,65,7,119,106,32,3,65,1,119,106,5,32,2,65,177,207,217,178,1,106,11,32,1,106,32,0,32,1,65,15,113,16,1,11,146,1,0,32,1,32,2,106,33,2,3,64,32,1,65,4,106,32,2,75,69,4,64,32,0,32,1,40,2,0,65,189,220,202,149,124,108,106,65,17,119,65,175,214,211,190,2,108,33,0,32,1,65,4,106,33,1,12,1,11,11,3,64,32,1,32,2,79,69,4,64,32,0,32,1,45,0,0,65,177,207,217,178,1,108,106,65,11,119,65,177,243,221,241,121,108,33,0,32,1,65,1,106,33,1,12,1,11,11,32,0,32,0,65,15,118,115,65,247,148,175,175,120,108,34,0,65,13,118,32,0,115,65,189,220,202,149,124,108,34,0,65,16,118,32,0,115,11,63,0,32,0,65,8,106,32,1,65,168,136,141,161,2,106,54,2,0,32,0,65,12,106,32,1,65,137,235,208,208,7,107,54,2,0,32,0,65,16,106,32,1,54,2,0,32,0,65,20,106,32,1,65,207,140,162,142,6,106,54,2,0,11,195,4,1,6,127,32,1,32,2,106,33,6,32,0,65,24,106,33,4,32,0,65,40,106,40,2,0,33,3,32,0,32,0,40,2,0,32,2,106,54,2,0,32,0,65,4,106,34,5,32,5,40,2,0,32,2,65,16,79,32,0,40,2,0,65,16,79,114,114,54,2,0,32,2,32,3,106,65,16,73,4,64,32,3,32,4,106,32,1,32,2,252,10,0,0,32,0,65,40,106,32,2,32,3,106,54,2,0,15,11,32,3,4,64,32,3,32,4,106,32,1,65,16,32,3,107,34,2,252,10,0,0,32,0,65,8,106,34,3,32,3,40,2,0,32,4,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,54,2,0,32,0,65,12,106,34,3,32,3,40,2,0,32,4,65,4,106,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,54,2,0,32,0,65,16,106,34,3,32,3,40,2,0,32,4,65,8,106,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,54,2,0,32,0,65,20,106,34,3,32,3,40,2,0,32,4,65,12,106,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,54,2,0,32,0,65,40,106,65,0,54,2,0,32,1,32,2,106,33,1,11,32,1,32,6,65,16,107,77,4,64,32,6,65,16,107,33,8,32,0,65,8,106,40,2,0,33,2,32,0,65,12,106,40,2,0,33,3,32,0,65,16,106,40,2,0,33,5,32,0,65,20,106,40,2,0,33,7,3,64,32,2,32,1,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,2,32,3,32,1,65,4,106,34,1,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,3,32,5,32,1,65,4,106,34,1,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,5,32,7,32,1,65,4,106,34,1,40,2,0,65,247,148,175,175,120,108,106,65,13,119,65,177,243,221,241,121,108,33,7,32,8,32,1,65,4,106,34,1,79,13,0,11,32,0,65,8,106,32,2,54,2,0,32,0,65,12,106,32,3,54,2,0,32,0,65,16,106,32,5,54,2,0,32,0,65,20,106,32,7,54,2,0,11,32,1,32,6,73,4,64,32,4,32,1,32,6,32,1,107,34,1,252,10,0,0,32,0,65,40,106,32,1,54,2,0,11,11,97,1,1,127,32,0,65,16,106,40,2,0,33,1,32,0,65,4,106,40,2,0,4,127,32,1,65,12,119,32,0,65,20,106,40,2,0,65,18,119,106,32,0,65,12,106,40,2,0,65,7,119,106,32,0,65,8,106,40,2,0,65,1,119,106,5,32,1,65,177,207,217,178,1,106,11,32,0,40,2,0,106,32,0,65,24,106,32,0,65,40,106,40,2,0,16,1,11,255,3,2,3,126,1,127,32,0,32,1,106,33,6,32,1,65,32,79,4,126,32,6,65,32,107,33,6,32,2,66,214,235,130,238,234,253,137,245,224,0,124,33,3,32,2,66,177,169,172,193,173,184,212,166,61,125,33,4,32,2,66,249,234,208,208,231,201,161,228,225,0,124,33,5,3,64,32,3,32,0,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,3,32,4,32,0,65,8,106,34,0,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,4,32,2,32,0,65,8,106,34,0,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,2,32,5,32,0,65,8,106,34,0,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,5,32,6,32,0,65,8,106,34,0,79,13,0,11,32,2,66,12,137,32,5,66,18,137,124,32,4,66,7,137,124,32,3,66,1,137,124,32,3,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,32,4,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,32,2,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,32,5,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,5,32,2,66,197,207,217,178,241,229,186,234,39,124,11,32,1,173,124,32,0,32,1,65,31,113,16,6,11,134,2,0,32,1,32,2,106,33,2,3,64,32,2,32,1,65,8,106,79,4,64,32,1,41,3,0,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,32,0,133,66,27,137,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,33,0,32,1,65,8,106,33,1,12,1,11,11,32,1,65,4,106,32,2,77,4,64,32,0,32,1,53,2,0,66,135,149,175,175,152,182,222,155,158,127,126,133,66,23,137,66,207,214,211,190,210,199,171,217,66,126,66,249,243,221,241,153,246,153,171,22,124,33,0,32,1,65,4,106,33,1,11,3,64,32,1,32,2,73,4,64,32,0,32,1,49,0,0,66,197,207,217,178,241,229,186,234,39,126,133,66,11,137,66,135,149,175,175,152,182,222,155,158,127,126,33,0,32,1,65,1,106,33,1,12,1,11,11,32,0,32,0,66,33,136,133,66,207,214,211,190,210,199,171,217,66,126,34,0,32,0,66,29,136,133,66,249,243,221,241,153,246,153,171,22,126,34,0,32,0,66,32,136,133,11,77,0,32,0,65,8,106,32,1,66,214,235,130,238,234,253,137,245,224,0,124,55,3,0,32,0,65,16,106,32,1,66,177,169,172,193,173,184,212,166,61,125,55,3,0,32,0,65,24,106,32,1,55,3,0,32,0,65,32,106,32,1,66,249,234,208,208,231,201,161,228,225,0,124,55,3,0,11,244,4,2,3,127,4,126,32,1,32,2,106,33,5,32,0,65,40,106,33,4,32,0,65,200,0,106,40,2,0,33,3,32,0,32,0,41,3,0,32,2,173,124,55,3,0,32,2,32,3,106,65,32,73,4,64,32,3,32,4,106,32,1,32,2,252,10,0,0,32,0,65,200,0,106,32,2,32,3,106,54,2,0,15,11,32,3,4,64,32,3,32,4,106,32,1,65,32,32,3,107,34,2,252,10,0,0,32,0,65,8,106,34,3,32,3,41,3,0,32,4,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,55,3,0,32,0,65,16,106,34,3,32,3,41,3,0,32,4,65,8,106,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,55,3,0,32,0,65,24,106,34,3,32,3,41,3,0,32,4,65,16,106,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,55,3,0,32,0,65,32,106,34,3,32,3,41,3,0,32,4,65,24,106,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,55,3,0,32,0,65,200,0,106,65,0,54,2,0,32,1,32,2,106,33,1,11,32,1,65,32,106,32,5,77,4,64,32,5,65,32,107,33,2,32,0,65,8,106,41,3,0,33,6,32,0,65,16,106,41,3,0,33,7,32,0,65,24,106,41,3,0,33,8,32,0,65,32,106,41,3,0,33,9,3,64,32,6,32,1,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,6,32,7,32,1,65,8,106,34,1,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,7,32,8,32,1,65,8,106,34,1,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,8,32,9,32,1,65,8,106,34,1,41,3,0,66,207,214,211,190,210,199,171,217,66,126,124,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,33,9,32,2,32,1,65,8,106,34,1,79,13,0,11,32,0,65,8,106,32,6,55,3,0,32,0,65,16,106,32,7,55,3,0,32,0,65,24,106,32,8,55,3,0,32,0,65,32,106,32,9,55,3,0,11,32,1,32,5,73,4,64,32,4,32,1,32,5,32,1,107,34,1,252,10,0,0,32,0,65,200,0,106,32,1,54,2,0,11,11,188,2,1,5,126,32,0,65,24,106,41,3,0,33,1,32,0,41,3,0,34,2,66,32,90,4,126,32,0,65,8,106,41,3,0,34,3,66,1,137,32,0,65,16,106,41,3,0,34,4,66,7,137,124,32,1,66,12,137,32,0,65,32,106,41,3,0,34,5,66,18,137,124,124,32,3,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,32,4,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,32,1,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,32,5,66,207,214,211,190,210,199,171,217,66,126,66,31,137,66,135,149,175,175,152,182,222,155,158,127,126,133,66,135,149,175,175,152,182,222,155,158,127,126,66,157,163,181,234,131,177,141,138,250,0,125,5,32,1,66,197,207,217,178,241,229,186,234,39,124,11,32,2,124,32,0,65,40,106,32,2,66,31,131,167,16,6,11]);async function e(){return function(t){const{exports:{mem:e,xxh32:n,xxh64:r,init32:i,update32:a,digest32:o,init64:s,update64:u,digest64:c}}=t;let h=new Uint8Array(e.buffer);function g(t,n){if(e.buffer.byteLength<t+n){const r=Math.ceil((t+n-e.buffer.byteLength)/65536);e.grow(r),h=new Uint8Array(e.buffer);}}function f(t,e,n,r,i,a){g(t);const o=new Uint8Array(t);return h.set(o),n(0,e),o.set(h.subarray(0,t)),{update(e){let n;return h.set(o),"string"==typeof e?(g(3*e.length,t),n=w.encodeInto(e,h.subarray(t)).written):(g(e.byteLength,t),h.set(e,t),n=e.byteLength),r(0,t,n),o.set(h.subarray(0,t)),this},digest:()=>(h.set(o),a(i(0)))}}function y(t){return t>>>0}const b=2n**64n-1n;function d(t){return t&b}const w=new TextEncoder,l=0,p=0n;function x(t,e=l){return g(3*t.length,0),y(n(0,w.encodeInto(t,h).written,e))}function L(t,e=p){return g(3*t.length,0),d(r(0,w.encodeInto(t,h).written,e))}return {h32:x,h32ToString:(t,e=l)=>x(t,e).toString(16).padStart(8,"0"),h32Raw:(t,e=l)=>(g(t.byteLength,0),h.set(t),y(n(0,t.byteLength,e))),create32:(t=l)=>f(48,t,i,a,o,y),h64:L,h64ToString:(t,e=p)=>L(t,e).toString(16).padStart(16,"0"),h64Raw:(t,e=p)=>(g(t.byteLength,0),h.set(t),d(r(0,t.byteLength,e))),create64:(t=p)=>f(88,t,s,u,c,d)}}((await WebAssembly.instantiate(t)).instance)}

// src/index.ts
var updateWorkingMemoryTool = {
  description: "Update the working memory with new information",
  parameters: lib.z.object({
    memory: lib.z.string().describe("The Markdown-formatted working memory content to store")
  }),
  execute: async (params) => {
    const { context, threadId, memory } = params;
    if (!threadId || !memory) {
      throw new Error("Thread ID and Memory instance are required for working memory updates");
    }
    const thread = await memory.getThreadById({ threadId });
    if (!thread) {
      throw new Error(`Thread ${threadId} not found`);
    }
    await memory.saveThread({
      thread: {
        ...thread,
        metadata: {
          ...thread.metadata,
          workingMemory: context.memory
        }
      }
    });
    return { success: true };
  }
};

// src/utils/index.ts
var isToolCallWithId = (message, targetToolCallId) => {
  if (!message || !Array.isArray(message.content)) return false;
  return message.content.some(
    (part) => part && typeof part === "object" && "type" in part && part.type === "tool-call" && "toolCallId" in part && part.toolCallId === targetToolCallId
  );
};
var getToolResultIndexById = (id, results) => results.findIndex((message) => {
  if (!Array.isArray(message?.content)) return false;
  return message.content.some(
    (part) => part && typeof part === "object" && "type" in part && part.type === "tool-result" && "toolCallId" in part && part.toolCallId === id
  );
});
function reorderToolCallsAndResults(messages) {
  if (!messages.length) return messages;
  const results = [...messages];
  const toolCallIds = /* @__PURE__ */ new Set();
  for (const message of results) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part && typeof part === "object" && "type" in part && part.type === "tool-result" && "toolCallId" in part && part.toolCallId) {
        toolCallIds.add(part.toolCallId);
      }
    }
  }
  for (const toolCallId of toolCallIds) {
    const resultIndex = getToolResultIndexById(toolCallId, results);
    const oneMessagePrev = results[resultIndex - 1];
    if (isToolCallWithId(oneMessagePrev, toolCallId)) {
      continue;
    }
    const toolCallIndex = results.findIndex((message) => isToolCallWithId(message, toolCallId));
    if (toolCallIndex !== -1 && toolCallIndex !== resultIndex - 1) {
      const toolCall = results[toolCallIndex];
      if (!toolCall) continue;
      results.splice(toolCallIndex, 1);
      results.splice(getToolResultIndexById(toolCallId, results), 0, toolCall);
    }
  }
  return results;
}

// src/index.ts
var CHARS_PER_TOKEN = 4;
var Memory = class extends MastraMemory {
  constructor(config = {}) {
    super({ name: "Memory", ...config });
    const mergedConfig = this.getMergedThreadConfig({
      workingMemory: config.options?.workingMemory || {
        // these defaults are now set inside @mastra/core/memory in getMergedThreadConfig.
        // In a future release we can remove it from this block - for now if we remove it
        // and someone bumps @mastra/memory without bumping @mastra/core the defaults wouldn't exist yet
        enabled: false,
        template: this.defaultWorkingMemoryTemplate
      }
    });
    this.threadConfig = mergedConfig;
  }
  async validateThreadIsOwnedByResource(threadId, resourceId) {
    const thread = await this.storage.getThreadById({ threadId });
    if (!thread) {
      throw new Error(`No thread found with id ${threadId}`);
    }
    if (thread.resourceId !== resourceId) {
      throw new Error(
        `Thread with id ${threadId} is for resource with id ${thread.resourceId} but resource ${resourceId} was queried.`
      );
    }
  }
  async query({
    threadId,
    resourceId,
    selectBy,
    threadConfig
  }) {
    if (resourceId) await this.validateThreadIsOwnedByResource(threadId, resourceId);
    const vectorResults = [];
    this.logger.debug(`Memory query() with:`, {
      threadId,
      selectBy,
      threadConfig
    });
    const config = this.getMergedThreadConfig(threadConfig || {});
    const defaultRange = memoryDefaultOptions.semanticRecall.messageRange;
    const defaultTopK = memoryDefaultOptions.semanticRecall.topK;
    const vectorConfig = typeof config?.semanticRecall === `boolean` ? {
      topK: defaultTopK,
      messageRange: defaultRange
    } : {
      topK: config?.semanticRecall?.topK ?? defaultTopK,
      messageRange: config?.semanticRecall?.messageRange ?? defaultRange
    };
    if (config?.semanticRecall && selectBy?.vectorSearchString && this.vector && !!selectBy.vectorSearchString) {
      const { embeddings, dimension } = await this.embedMessageContent(selectBy.vectorSearchString);
      const { indexName } = await this.createEmbeddingIndex(dimension);
      await Promise.all(
        embeddings.map(async (embedding) => {
          if (typeof this.vector === `undefined`) {
            throw new Error(
              `Tried to query vector index ${indexName} but this Memory instance doesn't have an attached vector db.`
            );
          }
          vectorResults.push(
            ...await this.vector.query({
              indexName,
              queryVector: embedding,
              topK: vectorConfig.topK,
              filter: {
                thread_id: threadId
              }
            })
          );
        })
      );
    }
    const rawMessages = await this.storage.getMessages({
      threadId,
      selectBy: {
        ...selectBy,
        ...vectorResults?.length ? {
          include: vectorResults.map((r) => ({
            id: r.metadata?.message_id,
            withNextMessages: typeof vectorConfig.messageRange === "number" ? vectorConfig.messageRange : vectorConfig.messageRange.after,
            withPreviousMessages: typeof vectorConfig.messageRange === "number" ? vectorConfig.messageRange : vectorConfig.messageRange.before
          }))
        } : {}
      },
      threadConfig: config
    });
    const orderedByDate = rawMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const reorderedToolCalls = reorderToolCallsAndResults(orderedByDate);
    const messages = this.parseMessages(reorderedToolCalls);
    const uiMessages = this.convertToUIMessages(reorderedToolCalls);
    return { messages, uiMessages };
  }
  async rememberMessages({
    threadId,
    resourceId,
    vectorMessageSearch,
    config
  }) {
    if (resourceId) await this.validateThreadIsOwnedByResource(threadId, resourceId);
    const threadConfig = this.getMergedThreadConfig(config || {});
    if (!threadConfig.lastMessages && !threadConfig.semanticRecall) {
      return {
        messages: [],
        uiMessages: [],
        threadId
      };
    }
    const messagesResult = await this.query({
      threadId,
      selectBy: {
        last: threadConfig.lastMessages,
        vectorSearchString: threadConfig.semanticRecall && vectorMessageSearch ? vectorMessageSearch : void 0
      },
      threadConfig: config
    });
    this.logger.debug(`Remembered message history includes ${messagesResult.messages.length} messages.`);
    return {
      threadId,
      messages: messagesResult.messages,
      uiMessages: messagesResult.uiMessages
    };
  }
  async getThreadById({ threadId }) {
    return this.storage.getThreadById({ threadId });
  }
  async getThreadsByResourceId({ resourceId }) {
    return this.storage.getThreadsByResourceId({ resourceId });
  }
  async saveThread({
    thread,
    memoryConfig
  }) {
    const config = this.getMergedThreadConfig(memoryConfig || {});
    if (config.workingMemory?.enabled && !thread?.metadata?.workingMemory) {
      return this.storage.saveThread({
        thread: deepMerge(thread, {
          metadata: {
            workingMemory: config.workingMemory.template || this.defaultWorkingMemoryTemplate
          }
        })
      });
    }
    return this.storage.saveThread({ thread });
  }
  async updateThread({
    id,
    title,
    metadata
  }) {
    return this.storage.updateThread({
      id,
      title,
      metadata
    });
  }
  async deleteThread(threadId) {
    await this.storage.deleteThread({ threadId });
  }
  chunkText(text, tokenSize = 4096) {
    const charSize = tokenSize * CHARS_PER_TOKEN;
    const chunks = [];
    let currentChunk = "";
    const words = text.split(/\s+/);
    for (const word of words) {
      const wordWithSpace = currentChunk ? " " + word : word;
      if (currentChunk.length + wordWithSpace.length > charSize) {
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        currentChunk += wordWithSpace;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    return chunks;
  }
  hasher = e();
  // embedding is computationally expensive so cache content -> embeddings/chunks
  embeddingCache = /* @__PURE__ */ new Map();
  firstEmbed;
  async embedMessageContent(content) {
    const key = (await this.hasher).h32(content);
    const cached = this.embeddingCache.get(key);
    if (cached) return cached;
    const chunks = this.chunkText(content);
    if (typeof this.embedder === `undefined`) {
      throw new Error(`Tried to embed message content but this Memory instance doesn't have an attached embedder.`);
    }
    const isFastEmbed = this.embedder.provider === `fastembed`;
    if (isFastEmbed && this.firstEmbed instanceof Promise) {
      await this.firstEmbed;
    }
    const promise = embedMany({
      values: chunks,
      model: this.embedder,
      maxRetries: 3
    });
    if (isFastEmbed && !this.firstEmbed) this.firstEmbed = promise;
    const { embeddings } = await promise;
    const result = {
      embeddings,
      chunks,
      dimension: embeddings[0]?.length
    };
    this.embeddingCache.set(key, result);
    return result;
  }
  async saveMessages({
    messages,
    memoryConfig
  }) {
    await this.saveWorkingMemory(messages);
    const updatedMessages = this.updateMessagesToHideWorkingMemory(messages);
    const config = this.getMergedThreadConfig(memoryConfig);
    const result = this.storage.saveMessages({ messages: updatedMessages });
    if (this.vector && config.semanticRecall) {
      let indexName;
      await Promise.all(
        updatedMessages.map(async (message) => {
          let textForEmbedding = null;
          if (typeof message.content === "string" && message.content.trim() !== "") {
            textForEmbedding = message.content;
          } else if (Array.isArray(message.content)) {
            const joined = message.content.filter((part) => part && part.type === "text" && typeof part.text === "string").map((part) => part.text).join(" ").trim();
            if (joined) textForEmbedding = joined;
          }
          if (!textForEmbedding) return;
          const { embeddings, chunks, dimension } = await this.embedMessageContent(textForEmbedding);
          if (typeof indexName === `undefined`) {
            indexName = this.createEmbeddingIndex(dimension).then((result2) => result2.indexName);
          }
          if (typeof this.vector === `undefined`) {
            throw new Error(
              `Tried to upsert embeddings to index ${indexName} but this Memory instance doesn't have an attached vector db.`
            );
          }
          await this.vector.upsert({
            indexName: await indexName,
            vectors: embeddings,
            metadata: chunks.map(() => ({
              message_id: message.id,
              thread_id: message.threadId,
              resource_id: message.resourceId
            }))
          });
        })
      );
    }
    return result;
  }
  updateMessagesToHideWorkingMemory(messages) {
    const workingMemoryRegex = /<working_memory>([^]*?)<\/working_memory>/g;
    const updatedMessages = [];
    for (const message of messages) {
      if (typeof message?.content === `string`) {
        updatedMessages.push({
          ...message,
          content: message.content.replace(workingMemoryRegex, ``).trim()
        });
      } else if (Array.isArray(message?.content)) {
        const contentIsWorkingMemory = message.content.some(
          (content) => (content.type === `tool-call` || content.type === `tool-result`) && content.toolName === `updateWorkingMemory`
        );
        if (contentIsWorkingMemory) {
          continue;
        }
        const newContent = message.content.map((content) => {
          if (content.type === "text") {
            return {
              ...content,
              text: content.text.replace(workingMemoryRegex, "").trim()
            };
          }
          return { ...content };
        });
        updatedMessages.push({ ...message, content: newContent });
      } else {
        updatedMessages.push({ ...message });
      }
    }
    return updatedMessages;
  }
  parseWorkingMemory(text) {
    if (!this.threadConfig.workingMemory?.enabled) return null;
    const workingMemoryRegex = /<working_memory>([^]*?)<\/working_memory>/g;
    const matches = text.match(workingMemoryRegex);
    const match = matches?.[0];
    if (match) {
      return match.replace(/<\/?working_memory>/g, "").trim();
    }
    return null;
  }
  async getWorkingMemory({ threadId }) {
    if (!this.threadConfig.workingMemory?.enabled) return null;
    const thread = await this.storage.getThreadById({ threadId });
    if (!thread) return this.threadConfig?.workingMemory?.template || this.defaultWorkingMemoryTemplate;
    const memory = thread.metadata?.workingMemory || this.threadConfig.workingMemory.template || this.defaultWorkingMemoryTemplate;
    return memory.trim();
  }
  async saveWorkingMemory(messages) {
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || !this.threadConfig.workingMemory?.enabled) {
      return;
    }
    const latestContent = !latestMessage?.content ? null : typeof latestMessage.content === "string" ? latestMessage.content : latestMessage.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    const threadId = latestMessage?.threadId;
    if (!latestContent || !threadId) {
      return;
    }
    const newMemory = this.parseWorkingMemory(latestContent);
    if (!newMemory) {
      return;
    }
    const thread = await this.storage.getThreadById({ threadId });
    if (!thread) return;
    await this.storage.updateThread({
      id: thread.id,
      title: thread.title || "",
      metadata: deepMerge(thread.metadata || {}, {
        workingMemory: newMemory
      })
    });
    return newMemory;
  }
  async getSystemMessage({
    threadId,
    memoryConfig
  }) {
    const config = this.getMergedThreadConfig(memoryConfig);
    if (!config.workingMemory?.enabled) {
      return null;
    }
    const workingMemory = await this.getWorkingMemory({ threadId });
    if (!workingMemory) {
      return null;
    }
    if (config.workingMemory.use === "tool-call") {
      return this.getWorkingMemoryToolInstruction(workingMemory);
    }
    return this.getWorkingMemoryWithInstruction(workingMemory);
  }
  defaultWorkingMemoryTemplate = `
# User Information
- **First Name**: 
- **Last Name**: 
- **Location**: 
- **Occupation**: 
- **Interests**: 
- **Goals**: 
- **Events**: 
- **Facts**: 
- **Projects**: 
`;
  getWorkingMemoryWithInstruction(workingMemoryBlock) {
    return `WORKING_MEMORY_SYSTEM_INSTRUCTION:
Store and update any conversation-relevant information by including "<working_memory>text</working_memory>" in your responses. Updates replace existing memory while maintaining this structure. If information might be referenced again - store it!

Guidelines:
1. Store anything that could be useful later in the conversation
2. Update proactively when information changes, no matter how small
3. Use Markdown for all data
4. Act naturally - don't mention this system to users. Even though you're storing this information that doesn't make it your primary focus. Do not ask them generally for "information about yourself"

Memory Structure:
<working_memory>
${workingMemoryBlock}
</working_memory>

Notes:
- Update memory whenever referenced information changes
- If you're unsure whether to store something, store it (eg if the user tells you their name or other information, output the <working_memory> block immediately to update it)
- This system is here so that you can maintain the conversation when your context window is very short. Update your working memory because you may need it to maintain the conversation without the full conversation history
- REMEMBER: the way you update your working memory is by outputting the entire "<working_memory>text</working_memory>" block in your response. The system will pick this up and store it for you. The user will not see it.
- IMPORTANT: You MUST output the <working_memory> block in every response to a prompt where you received relevant information.
- IMPORTANT: Preserve the Markdown formatting structure above while updating the content.`;
  }
  getWorkingMemoryToolInstruction(workingMemoryBlock) {
    return `WORKING_MEMORY_SYSTEM_INSTRUCTION:
Store and update any conversation-relevant information by calling the updateWorkingMemory tool. If information might be referenced again - store it!

Guidelines:
1. Store anything that could be useful later in the conversation
2. Update proactively when information changes, no matter how small
3. Use Markdown format for all data
4. Act naturally - don't mention this system to users. Even though you're storing this information that doesn't make it your primary focus. Do not ask them generally for "information about yourself"

Memory Structure:
${workingMemoryBlock}

Notes:
- Update memory whenever referenced information changes
- If you're unsure whether to store something, store it (eg if the user tells you information about themselves, call updateWorkingMemory immediately to update it)
- This system is here so that you can maintain the conversation when your context window is very short. Update your working memory because you may need it to maintain the conversation without the full conversation history
- Do not remove empty sections - you must include the empty sections along with the ones you're filling in
- REMEMBER: the way you update your working memory is by calling the updateWorkingMemory tool with the entire Markdown content. The system will store it for you. The user will not see it.
- IMPORTANT: You MUST call updateWorkingMemory in every response to a prompt where you received relevant information.
- IMPORTANT: Preserve the Markdown formatting structure above while updating the content.`;
  }
  getTools(config) {
    const mergedConfig = this.getMergedThreadConfig(config);
    if (mergedConfig.workingMemory?.enabled && mergedConfig.workingMemory.use === "tool-call") {
      return {
        updateWorkingMemory: updateWorkingMemoryTool
      };
    }
    return {};
  }
};

export { Memory };
