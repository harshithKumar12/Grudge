PYTHON ?= python3
VENV := .venv
ifeq ($(OS),Windows_NT)
VENV_PYTHON := $(VENV)/Scripts/python
else
VENV_PYTHON := $(VENV)/bin/python
endif
RUN_PYTHON := $(if $(wildcard $(VENV_PYTHON)),$(VENV_PYTHON),$(PYTHON))

.PHONY: install demo test lint typecheck viewer docs-check all

install:
	$(PYTHON) -m venv $(VENV)
	$(VENV_PYTHON) -m pip install -r requirements.lock
	$(VENV_PYTHON) -m pip install --no-deps -e .

demo:
	$(RUN_PYTHON) -m grudge demo

test:
	$(RUN_PYTHON) -m pytest

lint:
	$(RUN_PYTHON) -m ruff check grudge tests scripts

typecheck:
	$(RUN_PYTHON) -m mypy grudge scripts

viewer:
	$(RUN_PYTHON) -m grudge viewer

docs-check:
	$(RUN_PYTHON) -m scripts.docs_check

all: test lint typecheck docs-check
