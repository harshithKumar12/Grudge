// OWNER: lane-c
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findInstallRoot,
  findProjectInstallRoot,
  repositoryRoot,
  resolveInstallRoot,
} from "../src/installer/install-root.js";

/** Create `dir` plus an install marker (`<dir>/.grudge/config.json`). */
async function install(dir) {
  await mkdir(join(dir, ".grudge"), { recursive: true });
  await writeFile(join(dir, ".grudge/config.json"), '{"version":1}\n');
  return dir;
}

/** Create `dir` plus a repository marker. `.git` is a file in real worktrees. */
async function repository(dir, marker = "dir") {
  await mkdir(dir, { recursive: true });
  if (marker === "dir") await mkdir(join(dir, ".git"), { recursive: true });
  else await writeFile(join(dir, ".git"), "gitdir: elsewhere\n");
  return dir;
}

test("repositoryRoot treats a .git directory and a .git file as the same boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "grudge-root-"));
  await repository(join(root, "clone"));
  await repository(join(root, "worktree"), "file");
  const launchClone = join(root, "clone", "src", "deep");
  const launchWorktree = join(root, "worktree", "src");
  await mkdir(launchClone, { recursive: true });
  await mkdir(launchWorktree, { recursive: true });

  assert.equal(await repositoryRoot(launchClone, root), join(root, "clone"));
  assert.equal(await repositoryRoot(launchWorktree, root), join(root, "worktree"));
});

test("repositoryRoot stops at home instead of claiming the filesystem root", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const launch = join(home, "notes");
  await mkdir(launch, { recursive: true });

  assert.equal(await repositoryRoot(launch, home), null);
});

test("findInstallRoot binds a nested directory to its own repository's install", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const project = await repository(join(home, "project"));
  await install(project);
  const nested = join(project, "src", "module");
  await mkdir(nested, { recursive: true });

  assert.equal(await findInstallRoot({ launchDir: nested, home }), project);
});

test("findInstallRoot refuses to cross into an enclosing repository's install", async () => {
  // The deferred finding: `proj/vendor/lib` is its own repository, so the outer
  // `proj` install is not what the host loads there and must not be reported.
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const outer = await repository(join(home, "proj"));
  await install(outer);
  const vendored = await repository(join(outer, "vendor", "lib"));
  const launch = join(vendored, "src");
  await mkdir(launch, { recursive: true });

  assert.equal(await findInstallRoot({ launchDir: launch, home }), null);
});

test("findInstallRoot finds an install inside the repository, below its root", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const project = await repository(join(home, "monorepo"));
  const packageDir = join(project, "packages", "app");
  await install(packageDir);

  assert.equal(await findInstallRoot({ launchDir: packageDir, home }), packageDir);
});

test("findInstallRoot supports installs in directories without a repository marker", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const plain = await install(join(home, "plain-project"));
  const nested = join(plain, "sub");
  await mkdir(nested, { recursive: true });

  assert.equal(await findInstallRoot({ launchDir: nested, home }), plain);
});

test("findInstallRoot reports nothing instead of an unrelated parent install", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  await install(home);
  const unrelated = await repository(join(home, "scratch"));
  const launch = join(unrelated, "deep");
  await mkdir(launch, { recursive: true });

  assert.equal(await findInstallRoot({ launchDir: launch, home }), null);
});

test("resolveInstallRoot falls back to the user install, then to the launch directory", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  await install(home);
  const elsewhere = await repository(join(home, "other"));
  const launch = join(elsewhere, "src");
  await mkdir(launch, { recursive: true });

  assert.deepEqual(await resolveInstallRoot({ launchDir: launch, home }), { root: home, kind: "user" });

  const bareHome = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const bareLaunch = await repository(join(bareHome, "nothing"));
  assert.deepEqual(await resolveInstallRoot({ launchDir: bareLaunch, home: bareHome }), { root: bareLaunch, kind: "none" });
});

test("findProjectInstallRoot resolves a nested launch directory to the repository install", async () => {
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  const project = await repository(join(home, "project"));
  await install(project);
  const nested = join(project, "src");
  await mkdir(nested, { recursive: true });

  assert.equal(await findProjectInstallRoot({ launchDir: nested, home }), project);
});

test("findProjectInstallRoot never reaches a user install above an unrelated directory", async () => {
  // Uninstall safety: an install at home must not be removed by a command run
  // in a directory that is not inside any repository.
  const home = await mkdtemp(join(tmpdir(), "grudge-home-"));
  await install(home);
  const stray = join(home, "Downloads", "tmp");
  await mkdir(stray, { recursive: true });

  assert.equal(await findProjectInstallRoot({ launchDir: stray, home }), null);
  // ...but an explicit run in home itself still addresses the user install.
  assert.equal(await findProjectInstallRoot({ launchDir: home, home }), home);
});
