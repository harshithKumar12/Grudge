// OWNER: lane-c
import { createInstructionAdapter } from "./common.js";
export const adapter = createInstructionAdapter({
  id: "copilot",
  docsUrl: "https://docs.github.com/en/copilot/concepts/prompting-and-context/custom-instructions",
  targetLabel: ".github/copilot-instructions.md",
});
