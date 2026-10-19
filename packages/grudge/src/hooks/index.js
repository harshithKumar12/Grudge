// OWNER: integrator
import { postToolUse } from "./post-tool-use.js";
import { preToolUse } from "./pre-tool-use.js";
import { sessionStart } from "./session-start.js";
import { stop } from "./stop.js";
import { userPromptSubmit } from "./user-prompt-submit.js";

export const hooks = { postToolUse, preToolUse, sessionStart, stop, userPromptSubmit };
