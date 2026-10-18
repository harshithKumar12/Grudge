# Grudge

**Agents repeat mistakes. Grudge turns each failure into a deterministic regression scar.**

Grudge will compile an agent failure into three reviewable artifacts: a minimal
cassette, a never-again behavioral predicate, and a statistical verdict. The
Phase 9 CLI exposes the runtime pipeline described in
[the architecture](docs/architecture.md); later phases add event streaming and
the supporting viewer.

## Quickstart

The supported runtime is Python 3.11.11, recorded in `.python-version`.
Commands below create and use a project-local environment; they do not install
anything globally.

```bash
python3.11 -m venv .venv
make install
python -m grudge --help
```

The Phase 9 CLI wraps the recorder, shrinker, admission court, and statistical
gate. The offline demo uses only checked-in fake data and the scripted policy:

```bash
python -m grudge demo --no-browser
```

For the complete command reference and a manual capture → shrink → admit → run
pipeline, see [`docs/demo-guide.md`](docs/demo-guide.md).

### CLI reference

```text
grudge capture <agent_module> --out trace.jsonl [--json] [--debug]
grudge shrink <trace.jsonl> --failure <seed-rule> --out cassette.json [--agent <module>] [--json] [--debug]
grudge admit <cassette.json> --bad <module> --good <module> --out <scars-dir> [--json] [--debug]
grudge run --scars <file-or-dir> --agent <module> [--runs N] [--threshold T] [--json] [--debug]
grudge demo [--live] [--port 8765] [--no-browser] [--json] [--debug]
grudge scars list|show|retire [--json] [--debug]
```

Every command supports `--json` for machine-readable output and `--debug` for
a traceback on stderr. Missing files, schema failures, and other expected
engine failures exit 2. A gate passes with exit 0 and is blocked with exit 1.

## Checks

Run the single reproducible check bundle:

```bash
make test
make lint
make typecheck
make docs-check
make all
```

`requirements.lock` pins the direct and development dependencies. The Makefile
detects `.venv/bin/python` on POSIX systems and `.venv/Scripts/python` on
Windows. After activating the environment, its commands run `python -m ...`
through that project interpreter.

## Container build and deployment

The Dockerfile pins the Python base image and installs the lockfile into the
image:

```bash
docker build -t grudge:phase-9 .
docker run --rm grudge:phase-9
```

To deploy, push the same image to the registry used by your target platform:

```bash
docker tag grudge:phase-9 REGISTRY/PROJECT/grudge:phase-9
docker push REGISTRY/PROJECT/grudge:phase-9
```

No API keys or real personal data are needed for the offline path. Copy
`.env.example` only when a later live-LLM phase requires provider settings.

## Repository guide

### Phase 7 admission proof (offline)

The prebuilt example is `scars/sample_leak.scar.json`. From the project root,
activate the project environment and verify its repeated bad/red, fixed/green,
and benign-control proof:

```bash
source .venv/bin/activate
python -m pytest tests/test_admission_court.py tests/test_sample_scar.py
```

To explicitly regenerate the fixture after a new successful proof:

```bash
python -m scripts.build_sample_scar --runs 3
```

This replaces the sample only on successful admission. No API key or real
network is used. See [Admission rules](docs/architecture.md#admission-rules)
for rejection behavior, evidence, and the empty-trace interpretation. The
`grudge admit` command is available for the manual pipeline; see the demo
guide for its required options.

- [Architecture](docs/architecture.md) — pipeline stages and contracts.
- [Roadmap](docs/roadmap.md) — honest stubs and deferred work.
- [Documentation index](docs/INDEX.md) — every documentation file and owner phase.
- [Progress tracker](Progress.md) — the source of truth for phase status.

The project is built one phase at a time. See `PROMPT.md` for acceptance gates
and `AGENTS.md` for owner coding rules.
