/**
 * Minimal JSON Schema builders with the same call shape as the typebox
 * `Type.*` helpers the tools were written against, so tool definitions stay
 * declarative without a runtime dependency. Output is plain JSON Schema, which
 * is what MCP `inputSchema` expects.
 */

export type Schema = Record<string, unknown>;

const OPTIONAL = Symbol("optional");

type Options = Record<string, unknown>;

export const Type = {
  Object(properties: Record<string, Schema>, options: Options = {}): Schema {
    const props: Record<string, Schema> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(properties)) {
      const { [OPTIONAL]: optional, ...rest } = schema as Schema & { [OPTIONAL]?: boolean };
      props[key] = rest;
      if (!optional) required.push(key);
    }
    return {
      type: "object",
      properties: props,
      ...(required.length ? { required } : {}),
      additionalProperties: false,
      ...options,
    };
  },
  Optional(schema: Schema): Schema {
    return { ...schema, [OPTIONAL]: true };
  },
  String(options: Options = {}): Schema {
    return { type: "string", ...options };
  },
  Number(options: Options = {}): Schema {
    return { type: "number", ...options };
  },
  Integer(options: Options = {}): Schema {
    return { type: "integer", ...options };
  },
  Boolean(options: Options = {}): Schema {
    return { type: "boolean", ...options };
  },
  Array(items: Schema, options: Options = {}): Schema {
    return { type: "array", items, ...options };
  },
};

export function StringEnum(values: readonly string[], options: Options = {}): Schema {
  return { type: "string", enum: [...values], ...options };
}

/**
 * Validate `value` against the subset of JSON Schema produced above. Returns a
 * list of human-readable problems (empty when valid). Deliberately small: it
 * guards tool invariants (required ids, integer comment ids, enum decisions)
 * the way typebox validation did, not the whole JSON Schema spec.
 */
export function validate(schema: Schema, value: unknown, path = "params"): string[] {
  const problems: string[] = [];
  const type = schema.type;
  if (type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [`${path} must be an object`];
    }
    const record = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required ?? []) as string[]) {
      if (record[key] === undefined) problems.push(`${path}.${key} is required`);
    }
    for (const [key, v] of Object.entries(record)) {
      const sub = props[key];
      if (!sub) {
        if (schema.additionalProperties === false) problems.push(`${path}.${key} is not a known parameter`);
        continue;
      }
      if (v === undefined) continue;
      problems.push(...validate(sub, v, `${path}.${key}`));
    }
    return problems;
  }
  if (type === "string" && typeof value !== "string") return [`${path} must be a string`];
  if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return [`${path} must be a number`];
  if (type === "integer" && !Number.isInteger(value)) return [`${path} must be an integer`];
  if (type === "boolean" && typeof value !== "boolean") return [`${path} must be a boolean`];
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    value.forEach((item, i) => problems.push(...validate(schema.items as Schema, item, `${path}[${i}]`)));
    return problems;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return [`${path} must be one of: ${schema.enum.join(", ")}`];
  }
  return problems;
}
