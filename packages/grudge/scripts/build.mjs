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
const sources = new Map();
const moduleExports = new Map();
const external = (specifier) => !specifier.startsWith(".");

const keyFor = (file) => `./${file.slice(root.length + 5).replaceAll("\\", "/")}`;
const fileFor = (key) => resolve(root, "src", key.slice(2));

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
  const key = keyFor(file);
  if (modules.has(key)) return key;
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`build: cannot read module ${key} (${error.code ?? error.message})`);
  }
  modules.set(key, null);
  sources.set(key, source);
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
  moduleExports.set(key, new Set(names));
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

/** Fail the build when a relative import has no module or no matching export. */
function validateImports() {
  const problems = [];
  for (const [key, source] of sources) {
    for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']/g)) {
      const specifier = match[2];
      if (external(specifier)) continue;
      const dependencyKey = keyFor(resolve(dirname(fileFor(key)), specifier));
      if (!sources.has(dependencyKey)) {
        problems.push(`${key} imports ${specifier}, but no module ${dependencyKey} was bundled`);
        continue;
      }
      const available = moduleExports.get(dependencyKey) ?? new Set();
      for (const item of match[1].split(",")) {
        const original = item.trim().split(/\s+as\s+/)[0];
        if (!original) continue;
        if (!available.has(original)) {
          problems.push(`${key} imports {${original}} from ${specifier}, but that module exports: ${[...available].sort().join(", ") || "nothing"}`);
        }
      }
    }
  }
  if (problems.length) {
    throw new Error(`build: unresolved imports\n  - ${problems.join("\n  - ")}`);
  }
}

try {
  await collect(resolve(root, "src/cli.js"));
  validateImports();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
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
