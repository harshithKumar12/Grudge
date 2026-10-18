# Grudge

**Agents repeat mistakes. Grudge turns each failure into a deterministic regression scar.**

Grudge will compile an agent failure into three reviewable artifacts: a minimal
cassette, a never-again behavioral predicate, and a statistical verdict. The
Phase 0 bootstrap establishes the reproducible project and CLI surface; later
phases implement the runtime pipeline described in [the architecture](docs/architecture.md).

## Phase 0 quickstart

The supported runtime is Python 3.11.11, recorded in `.python-version`.
Commands below create and use a project-local environment; they do not install
anything globally.

```bash
python3.11 -m venv .venv
make install
python -m grudge --help
```

The command surface is intentionally scaffolded in Phase 0. Runtime commands
that belong to later phases report an explicit roadmap error instead of
pretending to work.

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
docker build -t grudge:phase-0 .
docker run --rm grudge:phase-0
```

To deploy, push the same image to the registry used by your target platform:

```bash
docker tag grudge:phase-0 REGISTRY/PROJECT/grudge:phase-0
docker push REGISTRY/PROJECT/grudge:phase-0
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
`grudge` CLI admission command remains scheduled for Phase 9.

- [Architecture](docs/architecture.md) — pipeline stages and contracts.
- [Roadmap](docs/roadmap.md) — honest stubs and deferred work.
- [Documentation index](docs/INDEX.md) — every documentation file and owner phase.
- [Progress tracker](Progress.md) — the source of truth for phase status.

The project is built one phase at a time. See `PROMPT.md` for acceptance gates
and `AGENTS.md` for owner coding rules.
