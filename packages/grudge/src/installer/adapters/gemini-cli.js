// OWNER: lane-c
import { createInstructionAdapter } from "./common.js";
export const adapter = createInstructionAdapter({
  id: "gemini-cli",
  docsUrl: "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md",
  targetLabel: "GEMINI.md",
});
