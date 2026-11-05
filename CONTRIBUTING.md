# Contributing to Grudge

Grudge is small on purpose. The most useful contributions are bug reports with
a reproduction, docs fixes where something was wrong or unclear, and focused
changes that do one thing.

## Quick checks before you open a pull request

```bash
python -m pytest -q
npm test --prefix packages/grudge
python -m scripts.docs_check
git diff --check
```

If a check fails before your change, say so in the pull request rather than
working around it.

## What makes a good pull request

- One behaviour per pull request, with the reasoning in the description.
- The command you ran and its actual output, not a paraphrase.
- Platform limits stated plainly. If you only tested on Linux, say so.
- Tests for new behaviour. Do not delete or weaken a test to make a check pass;
  if you believe a test is wrong, explain why in the description.

## Areas that need help

These are open and labelled in [the roadmap](docs/roadmap.md):

- pytest integration and a GitHub Actions workflow that runs `verify`;
- more recorder adapters so traces can come from frameworks other than the
  scripted demo agent;
- fault localization and richer outcome predicates;
- a Scar browser backed by the local event viewer.

## Reporting a bug

A useful report has:

1. The exact command and its complete output.
2. The Grudge version (`grudge --version`, `grudge-engine --version`).
3. OS, shell, Node version, and Python version.
4. Whether `grudge verify` passes on your machine — it separates an install
   problem from a logic problem.

Security issues with secret redaction or Guard enforcement should not go in a
public issue first. See [Security and privacy](README.md#security-and-privacy).

## Working on the docs

`python -m scripts.docs_check` validates links and documented command surfaces.
If you rename a flag, update the README section, the relevant file under `docs/`,
and the command's own `--help` text in the same pull request.

## Licence

By contributing you agree that your work is released under the
[MIT License](LICENSE).
