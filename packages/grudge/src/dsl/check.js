// OWNER: lane-a

function under(path, root) {
  const left = String(path).replaceAll("\\", "/").replace(/\/+$/, "");
  const right = String(root).replaceAll("\\", "/").replace(/\/+$/, "");
  return left === right || left.startsWith(`${right}/`);
}

function matches(value, expected) {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const entries = Object.entries(expected);
    if (entries.length === 1) {
      const [operator, operand] = entries[0];
      if (operator === "$eq") return Object.is(value, operand) || value === operand;
      if (operator === "$contains") return typeof value === "string" && value.includes(String(operand));
      if (operator === "$under") return typeof value === "string" && under(value, operand);
      if (operator === "$not_under") return typeof value === "string" && !under(value, operand);
    }
    return value !== null && typeof value === "object" && !Array.isArray(value) && Object.entries(expected).every(([key, item]) => key in value && matches(value[key], item));
  }
  return Object.is(value, expected) || value === expected;
}

function values(value) {
  if (Array.isArray(value)) return value.flatMap(values);
  if (value && typeof value === "object") return Object.values(value).flatMap(values);
  return [value];
}

function field(event, name) {
  if (name == null || name === "") return event.result;
  return event.args && Object.prototype.hasOwnProperty.call(event.args, name) ? event.args[name] : event[name];
}

function callViolations(rule, events) {
  const found = events.flatMap((event, index) => event.tool === rule.tool && matches(event.args ?? {}, rule.match ?? {}) ? [index] : []);
  return found;
}

function orderingViolations(rule, events) {
  let prerequisite = false;
  const result = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.tool === rule.ordering?.before) prerequisite = true;
    else if (event.tool === rule.ordering?.after && !prerequisite) result.push(index);
  }
  return result;
}

function taintViolations(rule, events) {
  const taint = rule.taint ?? {};
  const sources = [];
  const result = [];
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.tool === taint.source && matches(event.args ?? {}, taint.sourceMatch ?? {})) {
      const value = field(event, taint.sourceField);
      if (value !== null && value !== undefined && value !== "") sources.push(...values(value));
    }
    if (event.tool !== taint.sink) continue;
    const sink = field(event, taint.sinkField);
    const sinkValues = values(sink);
    if (sources.some((source) => source !== null && source !== "" && sinkValues.some((candidate) => source === candidate || (typeof source === "string" && typeof candidate === "string" && candidate.includes(source))))) result.push(index);
  }
  return result;
}

/** @param {object} rule @param {object[]} events */
export function check(rule, events) {
  if (!rule || !Array.isArray(events)) throw new TypeError("rule and events are required");
  let atEvents;
  if (rule.kind === "call_shape") atEvents = callViolations(rule, events);
  else if (rule.kind === "ordering") atEvents = orderingViolations(rule, events);
  else if (rule.kind === "taint_flow") atEvents = taintViolations(rule, events);
  else throw new TypeError(`unsupported predicate kind: ${rule.kind}`);
  return { violated: rule.kind === "call_shape" && rule.polarity === "must" ? atEvents.length === 0 : atEvents.length > 0, atEvents };
}
