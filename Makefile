# Impasto on this computer. Run this way, nobody signs in: accounts are only for the hosted demo.
# Needs uv (https://docs.astral.sh/uv/) and Node 22+, and ffmpeg for dictation.

PORT ?= 8000
.DEFAULT_GOAL := help
.PHONY: help install build example run dev test key

help:
	@echo "make install   install the backend and the web app"
	@echo "make example   look through the example piece: no keys, nothing calls a model"
	@echo "make run       the whole app, with MODEL_API_KEY from .env"
	@echo "make dev       the same, reloading as you edit, on http://localhost:5173"
	@echo "make test      the backend tests"

install:
	cd backend && uv sync
	cd web && npm install

build:
	cd web && npm run build

example: build
	@echo "Impasto, example only: http://localhost:$(PORT)"
	cd backend && IMPASTO_MODE=example uv run uvicorn impasto.api:app --port $(PORT)

run: key build
	@echo "Impasto: http://localhost:$(PORT)"
	cd backend && IMPASTO_MODE=local uv run uvicorn impasto.api:app --port $(PORT)

# The web app's dev server sends /api to port 8000, so the API stays there. If either stops, both do.
dev: SHELL := bash
dev: key
	@trap 'kill 0' EXIT; \
	(cd backend && IMPASTO_MODE=local uv run uvicorn impasto.api:app --port 8000 --reload) & \
	(cd web && npm run dev) & \
	wait -n

test:
	cd backend && uv run pytest

key:
	@[ -n "$$MODEL_API_KEY" ] || grep -qs '^MODEL_API_KEY=..*' .env || { \
		echo "No model key. Run: cp .env.example .env, and put yours in MODEL_API_KEY. Or try make example."; exit 1; }
