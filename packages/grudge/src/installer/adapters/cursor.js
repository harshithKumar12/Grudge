// OWNER: lane-c
import { createInstructionAdapter } from "./common.js";

// Cursor's current public documentation page did not expose a stable, exact
// rules filename in the verification run. Keep this adapter advisory-only and
// non-writing until that contract is confirmed.
export const adapter = createInstructionAdapter({
  id: "cursor",
  docsUrl: "https://docs.cursor.com/context/rules",
  targetLabel: ".cursor/rules/*.mdc",
  verified: false,
});
