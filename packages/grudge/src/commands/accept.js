// OWNER: lane-b
import { scars } from "./scars.js";
import { appendEvent } from "../core/stats.js";

/** Promote one pending Scar to block mode; repeated acceptance is harmless. */
export async function accept(id, options = {}) {
  if (id && typeof id === "object") {
    options = id;
    id = options.id;
  }
  if (!id) throw new Error("scar id is required");
  const result = await scars("accept", { ...options, id });
  try { await appendEvent(options.root ?? process.cwd(), { type: "accepted", scarId: id, sessionId: options.session ?? options.sessionId ?? null }); } catch { /* reporting is advisory */ }
  return { id, accepted: true, ...result };
}
