// OWNER: lane-a

/** @typedef {{kind:string, tool:string, match:object, ordering:object, taint:object, polarity?:string, source:string}} RuntimeRule */

class ParseError extends Error {
  /** @param {string} message @param {number} line @param {number} column @param {string} hint */
  constructor(message, line, column, hint) {
    super(`${message} at line ${line}, column ${column}. Hint: ${hint}`);
    this.name = "PredicateParseError";
    this.line = line;
    this.column = column;
    this.hint = hint;
  }
}

/** @param {string} source */
function tokenize(source) {
  /** @type {{value:any, raw:string, pos:number, kind:string}[]} */
  const tokens = [];
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) { i += 1; continue; }
    const pos = i;
    if (source[i] === '"') {
      let end = i + 1;
      let escaped = false;
      for (; end < source.length; end += 1) {
        const char = source[end];
        if (char === '"' && !escaped) { end += 1; break; }
        escaped = char === "\\" && !escaped;
        if (char !== "\\") escaped = false;
      }
      if (source[end - 1] !== '"') throw new ParseError("unterminated string", 1, pos + 1, "close the string with a quote");
      const raw = source.slice(i, end);
      try { tokens.push({ value: JSON.parse(raw), raw, pos, kind: "string" }); }
      catch { throw new ParseError("invalid JSON string", 1, pos + 1, "use JSON escaping inside quotes"); }
      i = end;
      continue;
    }
    if ("(){}[],:;=~".includes(source[i])) {
      tokens.push({ value: source[i], raw: source[i], pos, kind: "symbol" });
      i += 1;
      continue;
    }
    const match = source.slice(i).match(/^[^\s(){}\[\],:;=~]+/);
    if (!match) throw new ParseError(`unexpected character ${source[i]}`, 1, i + 1, "remove this character");
    const raw = match[0];
    let value = raw;
    if (raw === "true") value = true;
    else if (raw === "false") value = false;
    else if (raw === "null") value = null;
    else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)) value = Number(raw);
    tokens.push({ value, raw, pos, kind: "word" });
    i += raw.length;
  }
  return tokens;
}

/** @param {string} source @param {number} pos @param {string} message @param {string} hint */
function error(source, pos, message, hint) {
  const before = source.slice(0, pos);
  const line = before.split("\n").length;
  const column = pos - before.lastIndexOf("\n");
  throw new ParseError(message, line, column, hint);
}

/** @param {string} source */
export function parse(source) {
  if (typeof source !== "string" || !source.trim()) error(String(source ?? ""), 0, "empty predicate", "start with 'never call' or 'must call'");
  const tokens = tokenize(source);
  let cursor = 0;
  const peek = () => tokens[cursor];
  const take = (value) => {
    const token = peek();
    if (!token || (value !== undefined && token.raw !== value)) error(source, token?.pos ?? source.length, `expected '${value}'`, `insert '${value}' here`);
    cursor += 1;
    return token;
  };
  const name = () => {
    const token = peek();
    if (!token || !["word", "string"].includes(token.kind) || typeof token.value !== "string") error(source, token?.pos ?? source.length, "expected a tool or field name", "use an identifier or quoted string");
    cursor += 1;
    return token.value;
  };
  const jsonValue = () => {
    const token = peek();
    if (!token) error(source, source.length, "expected a JSON value", "add a value after '='");
    if (token.raw === "[") {
      take("["); const result = [];
      if (peek()?.raw !== "]") while (true) {
        result.push(jsonValue());
        if (peek()?.raw !== ",") break;
        take(",");
      }
      take("]"); return result;
    }
    if (token.raw === "{") {
      take("{"); const result = {};
      if (peek()?.raw !== "}") while (true) {
        const key = name(); take(":"); result[key] = jsonValue();
        if (peek()?.raw !== ",") break;
        take(",");
      }
      take("}"); return result;
    }
    if (["string", "word"].includes(token.kind)) { cursor += 1; return token.value; }
    error(source, token.pos, "expected a JSON value", "use a string, number, boolean, null, array, or object");
  };
  const conditions = (closing, firstField = null) => {
    /** @type {Record<string, any>} */
    const match = {};
    let pendingField = firstField;
    while (peek() && (!closing || peek().raw !== closing)) {
      const field = pendingField ?? name();
      pendingField = null;
      const operator = peek()?.raw;
      if (operator === "=") {
        take("="); match[field] = { $eq: jsonValue() };
      } else if (operator === "~") {
        take("~"); const value = jsonValue();
        if (typeof value !== "string") error(source, peek()?.pos ?? source.length, "substring match needs a string", "quote the value after '~'");
        match[field] = { $contains: value };
      } else if (operator === "under" || operator === "not") {
        take(operator);
        if (operator === "not") take("under");
        const value = jsonValue();
        if (typeof value !== "string" || !value) error(source, peek()?.pos ?? source.length, "path filter needs a non-empty string", "quote the path root");
        match[field] = { [operator === "under" ? "$under" : "$not_under"]: value };
      } else {
        error(source, peek()?.pos ?? source.length, "expected '=', '~', 'under', or 'not under'", "add a condition operator");
      }
      if (peek()?.raw === "and") { take("and"); continue; }
      break;
    }
    return match;
  };

  const first = take().raw;
  if (first === "never") {
    const kind = peek()?.raw;
    if (kind === "flow") {
      take("flow"); const sourceTool = name();
      let sourceField = null;
      if (peek()?.raw === "field") { take("field"); sourceField = name(); }
      take("to"); const sinkTool = name();
      let sinkField = null;
      if (peek()?.raw === "field") { take("field"); sinkField = name(); }
      if (peek()) error(source, peek().pos, "unexpected text after flow rule", "remove the trailing text");
      return { kind: "taint_flow", tool: sinkTool, match: {}, ordering: { before: "", after: "" }, taint: { source: sourceTool, sink: sinkTool, sourceField, sinkField, sourceMatch: {} }, polarity: "never", source };
    }
    take("call");
    const tool = name();
    if (peek()?.raw !== "where") {
      if (peek()) error(source, peek().pos, "unexpected text after tool name", "remove the trailing text or add 'where'");
      return { kind: "call_shape", tool, match: {}, ordering: { before: "", after: "" }, taint: { source: "", sink: "" }, polarity: "never", source };
    }
    take("where");
    const field = name();
    if (peek()?.raw === "tainted_by") {
      take("tainted_by"); const sourceTool = name();
      let sourceMatch = {};
      if (peek()?.raw === "(") { take("("); sourceMatch = conditions(")"); take(")"); }
      if (peek()) error(source, peek().pos, "unexpected text after taint rule", "remove the trailing text");
      return { kind: "taint_flow", tool, match: {}, ordering: { before: "", after: "" }, taint: { source: sourceTool, sink: tool, sourceField: null, sinkField: field, sourceMatch }, polarity: "never", source };
    }
    const match = conditions(null, field);
    if (peek()) error(source, peek().pos, "unexpected text after call rule", "remove the trailing text");
    return { kind: "call_shape", tool, match, ordering: { before: "", after: "" }, taint: { source: "", sink: "" }, polarity: "never", source };
  }
  if (first === "must") {
    take("call");
    const before = name();
    if (peek()?.raw === "before") {
      take("before"); take("call"); const after = name();
      if (peek()) error(source, peek().pos, "unexpected text after ordering rule", "remove the trailing text");
      return { kind: "ordering", tool: after, match: {}, ordering: { before, after }, taint: { source: "", sink: "" }, polarity: "must", source };
    }
      const match = peek()?.raw === "where" ? (take("where"), conditions()) : {};
    if (peek()) error(source, peek().pos, "unexpected text after call rule", "remove the trailing text");
    return { kind: "call_shape", tool: before, match, ordering: { before: "", after: "" }, taint: { source: "", sink: "" }, polarity: "must", source };
  }
  error(source, tokens[0]?.pos ?? 0, `unsupported predicate '${first}'`, "start with 'never' or 'must'");
}

export { ParseError };
