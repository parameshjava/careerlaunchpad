# CareerLaunchpad — dev workflow shortcuts.
# Run `make` (or `make help`) to see every target.
#
# Why this exists: `next build` and `next dev` share the .next/ directory, so
# running a production build while the dev server is live can leave the dev
# server (and your browser) serving stale/mixed chunks. `make restart` and
# `make rebuild` clear that state deterministically.

# Use bash so recipes behave consistently.
SHELL := /bin/bash

.DEFAULT_GOAL := help

# Build/tooling caches that are safe to delete (regenerated on next run).
CACHES := .next node_modules/.cache .turbo tsconfig.tsbuildinfo *.tsbuildinfo

.PHONY: help
help: ## List available targets
	@echo "CareerLaunchpad — make targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

.PHONY: dev
dev: ## Start the Next.js dev server (http://localhost:3000)
	npm run dev

.PHONY: run
run: dev ## Alias for `make dev`

.PHONY: build
build: ## Production build (also type-checks). Stop the dev server first.
	npm run build

.PHONY: start
start: ## Serve the production build (run `make build` first)
	npm run start

.PHONY: lint
lint: ## Run ESLint (next lint)
	npm run lint

.PHONY: typecheck
typecheck: ## Type-check only, no emit
	npx tsc --noEmit

.PHONY: stop
stop: ## Stop any running Next.js dev server
	@echo "Stopping any running next dev / next-server…"
	-@pkill -f "next dev" 2>/dev/null || true
	-@pkill -f "next-server" 2>/dev/null || true
	@echo "Done."

.PHONY: clean
clean: ## Remove build caches + temp files (.next, TS build info, .turbo)
	@echo "Removing build caches: $(CACHES)"
	@rm -rf $(CACHES)
	@echo "Clean."

.PHONY: clean-all
clean-all: clean ## clean + remove node_modules
	@echo "Removing node_modules…"
	@rm -rf node_modules
	@echo "All clean."

.PHONY: install
install: ## Install dependencies (npm install)
	npm install

.PHONY: ci
ci: ## Clean, reproducible install from the lockfile (npm ci)
	npm ci

.PHONY: rebuild
rebuild: clean build ## Clear caches, then production build

.PHONY: restart
restart: stop clean dev ## Stop dev server, clear caches, start a fresh dev server

.PHONY: fresh
fresh: stop clean-all install build ## Full reset: stop, wipe caches + node_modules, reinstall, build
