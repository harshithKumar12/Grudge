// OWNER: lane-a
import { loadConfig } from "../core/config.js";
import { aggregate, readEvents } from "../core/stats.js";

function section(value) {
  return {
    sessionId: value.sessionId,
    caught: value.caught,
    blocked: value.blocked,
    warned: value.warned,
    proposals: value.proposals,
    accepted: value.accepted,
    injectedChars: value.injectedChars,
    injectedTokens: value.injectedTokens,
    avoidedRetryTokens: value.avoidedRetryTokens,
    netSavingsTokens: value.netSavingsTokens,
    estimated: true,
  };
}

/** Build the session/lifetime savings report from append-only events. */
export async function report(options = {}) {
  const root = options.cwd || options.root || process.cwd();
  const config = await loadConfig(root);
  let sessionId = typeof options.session === "string" ? options.session : typeof options.sessionId === "string" ? options.sessionId : null;
  if (options.session === true || options.sessionId === true) {
    const events = await readEvents(root);
    sessionId = events.at(-1)?.sessionId ?? events.at(-1)?.session_id ?? null;
  }
  const includeSession = options.session === true || options.sessionId === true || options.session !== undefined;
  const includeLifetime = options.lifetime === true || options.lifetime === undefined;
  const result = { estimated: true };
  if (includeSession) result.session = section(await aggregate(root, sessionId, config.avoidedRetryTokens));
  if (includeLifetime) result.lifetime = section(await aggregate(root, null, config.avoidedRetryTokens));
  if (!includeSession && !includeLifetime) result.lifetime = section(await aggregate(root, null, config.avoidedRetryTokens));
  if (options.json || options.print === false) {
    if (options.print !== false && options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  }
  const lines = [];
  for (const [name, value] of Object.entries(result)) {
    if (name === "estimated") continue;
    lines.push(`${name}: ${value.caught} caught, ${value.blocked} blocked, ${value.warned} warned, ${value.proposals} proposals, ${value.accepted} accepted`);
    lines.push(`  ~${value.avoidedRetryTokens} avoided retry tokens (est.), ~${value.injectedTokens} injected tokens (est.), ~${value.netSavingsTokens} net tokens (est.)`);
  }
  if (options.print !== false) process.stdout.write(`${lines.join("\n")}\n`);
  return result;
}
