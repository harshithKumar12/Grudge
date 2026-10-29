// OWNER: integrator
import { accept } from "./accept.js";
import { doctor } from "./doctor.js";
import { hook } from "./hook.js";
import { propose } from "./propose.js";
import { report } from "./report.js";
import { scars } from "./scars.js";
import { setup } from "./setup.js";
import { stats } from "./stats.js";
import { statusline } from "./statusline.js";
import { uninstall } from "./uninstall.js";
import { verify } from "./verify.js";

const registry = { accept, doctor, hook, propose, scars, setup, stats, statusline, uninstall };
// Keep the Phase 14 public registry enumeration stable while exposing the additive report command.
Object.defineProperty(registry, "report", { value: report, enumerable: false });
Object.defineProperty(registry, "verify", { value: verify, enumerable: false });
export const commands = registry;
