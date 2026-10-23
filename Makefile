PYTHON ?= python3
VENV := .venv
ifeq ($(OS),Windows_NT)
VENV_PYTHON := $(VENV)/Scripts/python
else
VENV_PYTHON := $(VENV)/bin/python
endif
RUN_PYTHON := $(if $(wildcard $(VENV_PYTHON)),$(VENV_PYTHON),$(PYTHON))

.PHONY: install demo test python-test lint typecheck viewer docs-check release-check node-test node-build all

install:
	$(PYTHON) -m venv $(VENV)
	$(VENV_PYTHON) -m pip install -r requirements.lock
	$(VENV_PYTHON) -m pip install --no-deps -e .

demo:
	$(RUN_PYTHON) -m grudge demo

test: python-test node-test

python-test:
	$(RUN_PYTHON) -m pytest

lint:
	$(RUN_PYTHON) -m ruff check grudge tests scripts

typecheck:
	$(RUN_PYTHON) -m mypy grudge scripts

viewer:
	$(RUN_PYTHON) -m grudge viewer

docs-check:
	$(RUN_PYTHON) -m scripts.docs_check

release-check:
	$(RUN_PYTHON) -m scripts.release_check

node-test:
	@if command -v node >/dev/null 2>&1 && test -f packages/grudge/package.json; then cd packages/grudge && npm test; else echo "node-test: Node unavailable; skipped"; fi

node-build:
	@if command -v node >/dev/null 2>&1 && test -f packages/grudge/package.json; then cd packages/grudge && npm run build; else echo "node-build: Node unavailable; skipped"; fi

all: test lint typecheck docs-check release-check node-build
