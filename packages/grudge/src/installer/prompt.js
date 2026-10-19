// OWNER: lane-c
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

/** Resolve setup choices. --yes remains non-interactive and deterministic. */
export async function prompt({ detected = [], agents = [], scope = "repo", yes = false, inputStream = input, outputStream = output } = {}) {
  const available = detected.filter((item) => item.detected).map((item) => item.id);
  const selected = agents.length ? agents : (yes ? available : null);
  if (selected && scope) return { agents: selected, scope };
  const rl = createInterface({ input: inputStream, output: outputStream });
  try {
    const answer = await rl.question(`Agents (${available.join(", ")}): `);
    const chosen = answer.trim() ? answer.split(",").map((item) => item.trim()).filter(Boolean) : available;
    const chosenScope = (await rl.question("Scope (repo|local|global) [repo]: ")).trim() || "repo";
    if (!["repo", "local", "global"].includes(chosenScope)) throw new Error("scope must be repo, local, or global");
    return { agents: chosen, scope: chosenScope };
  } finally { rl.close(); }
}
