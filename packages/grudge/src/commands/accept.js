// OWNER: lane-b
import { scars } from "./scars.js";

/** Promote one pending Scar to block mode; repeated acceptance is harmless. */
export async function accept(id, options = {}) {
  if (id && typeof id === "object") {
    options = id;
    id = options.id;
  }
  if (!id) throw new Error("scar id is required");
  const result = await scars("accept", { ...options, id });
  return { id, accepted: true, ...result };
}
