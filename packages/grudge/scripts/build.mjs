// OWNER: integrator
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..");
const target = resolve(root, "dist/grudge.mjs");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
await mkdir(dirname(target), { recursive: true });

const modules = new Map();
const external = (specifier) => !specifier.startsWith(".");

function exportNames(source) {
  const names = [];
  for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.push(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of match[1].split(",")) {
      const [name, alias] = item.trim().split(/\s+as\s+/);
      if (name) names.push(alias || name);
    }
  }
  return [...new Set(names)];
}

async function collect(file) {
  const key = `./${file.slice(root.length + 5).replaceAll("\\", "/")}`;
  if (modules.has(key)) return key;
  let source = await readFile(file, "utf8");
  modules.set(key, null);
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (external(specifier)) continue;
    const dependency = resolve(dirname(file), specifier);
    await collect(dependency);
  }
  const imports = [];
  source = source.replace(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["'];?/g, (_all, names, specifier) => {
    const bindings = names.split(",").map((item) => {
      const [original, local] = item.trim().split(/\s+as\s+/);
      return `${original}: ${local || original}`;
    }).join(", ");
    imports.push(`const { ${bindings} } = await __import(${JSON.stringify(specifier)}, __moduleKey);`);
    return "";
  });
  source = source.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["'];?/g, (_all, local, specifier) => {
    imports.push(`const ${local} = await __import(${JSON.stringify(specifier)}, __moduleKey);`);
    return "";
  });
  const names = exportNames(source);
  source = source.replace(/export\s+(?=(?:async\s+)?(?:function|const|let|var|class)\s+)/g, "");
  source = source.replace(/export\s*\{[^}]+\};?/g, "");
  source = source.replaceAll("import.meta.url", "__moduleUrl");
  if (key === "./cli.js") {
    source = source.replace(/if\s*\(process\.argv\[1\][\s\S]*?\n\}/, "");
  }
  const returnObject = names.length ? `return { ${names.join(", ")} };` : "return {};";
  modules.set(key, `${imports.join("\n")}\n${source}\n${returnObject}`);
  return key;
}

await collect(resolve(root, "src/cli.js"));
const encoded = [...modules.entries()].map(([key, source]) => `${JSON.stringify(key)}: async (__moduleUrl, __import, __moduleKey) => {\n${source}\n}`).join(",\n");
const contents = `#!/usr/bin/env node
// Grudge v${packageJson.version}
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const __require = createRequire(import.meta.url);
const __modules = {\n${encoded}\n};
const __cache = new Map();
async function __load(key) {
  if (__cache.has(key)) return __cache.get(key);
  const factory = __modules[key];
  if (!factory) throw new Error(\`Missing bundled module: \${key}\`);
  const promise = factory(import.meta.url, __import, key);
  __cache.set(key, promise);
  return promise;
}
async function __import(specifier, parentKey) {
  if (!specifier.startsWith(".")) return import(specifier);
  const virtual = new URL(specifier, "file:///virtual/src/" + parentKey.slice(2));
  const key = "./" + virtual.pathname.slice("/virtual/src/".length);
  return __load(key);
}
try {
  const entry = await __load("./cli.js");
  process.exitCode = await entry.main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv[2] === "hook") {
    process.stderr.write("grudge: hook failed; allowed (fail-open): " + message + "\\n");
    process.exitCode = 0;
  } else {
    process.stderr.write(JSON.stringify({ error: message }) + "\\n");
    process.exitCode = 1;
  }
}
`;
await writeFile(target, contents, "utf8");
