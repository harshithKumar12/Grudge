// OWNER: integrator
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const source = resolve(root, "src/cli.js");
const target = resolve(root, "dist/grudge.mjs");
await mkdir(dirname(target), { recursive: true });
const contents = await readFile(source, "utf8");
await writeFile(target, `#!/usr/bin/env node\n${contents}`, "utf8");
await cp(resolve(root, "package.json"), resolve(root, "dist/package.json"));
