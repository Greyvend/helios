# Helios — Claude Code Agent Guide

> **Maintenance rule**: After making any changes to the project (new packages, scripts, conventions, env vars, architecture patterns, etc.), update this file to reflect those changes before finishing the task.

Helios is a minimal web-based GUI for AI coding agents (Codex, Claude Code). It wraps provider CLIs via JSON-RPC over stdio and exposes a React web app over WebSocket. This is a Bun monorepo using Turbo for build orchestration.

---

## Essential Commands

```bash
# Install dependencies
bun install

# Start full dev stack (hot reload: contracts + server + web)
bun run dev

# Individual dev targets
bun run dev:server      # Server only
bun run dev:web         # Web UI only (Vite)
bun run dev:desktop     # Electron desktop

# Build
bun run build           # Production build (all packages)
bun run start           # Run production server

# Quality checks (run before committing)
bun run typecheck       # TypeScript strict checks across all packages
bun run lint            # Oxlint
bun run fmt:check       # Oxfmt format check
bun run fmt             # Auto-fix formatting

# Tests
bun run test            # All unit tests (Vitest via Turbo)
cd apps/web && bun run test:browser          # Browser tests (Playwright/Chromium)
cd apps/web && bun run test:browser:install  # First-time Playwright setup

# Desktop distribution
bun run dist:desktop:dmg        # macOS arm64 .dmg
bun run dist:desktop:dmg:x64   # macOS Intel .dmg
bun run dist:desktop:linux     # Linux AppImage
bun run dist:desktop:win       # Windows NSIS installer

# Cleanup
bun run clean  # Remove dist, node_modules, .turbo everywhere
```

---

## Monorepo Structure

```
helios/
├── apps/
│   ├── web/         # React 19 + Vite frontend (TanStack Router/Query, Zustand, xterm)
│   ├── server/      # Node.js WebSocket server (Effect, SQLite, node-pty)
│   ├── desktop/     # Electron 40 wrapper
│   └── marketing/   # Astro landing page
├── packages/
│   ├── contracts/   # Shared types/schemas (Effect Schema) — source of truth for all types
│   └── shared/      # Runtime utilities (subpath exports, no barrel index)
├── scripts/         # Build & dev orchestration scripts
└── .docs/           # Internal architecture documentation
```

**Key internal docs**: `.docs/architecture.md`, `.docs/provider-architecture.md`, `.docs/runtime-modes.md`, `.docs/encyclopedia.md`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24.13.1+, Bun 1.3.9 |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Routing | TanStack React Router v1 |
| State | TanStack React Query v5, Zustand v5 |
| Backend | Effect (functional runtime), WebSocket (ws), node-pty |
| Persistence | SQLite via @effect/sql-sqlite-bun |
| Desktop | Electron 40 |
| Testing | Vitest (unit), Playwright (browser) |
| Linting | Oxlint, Oxfmt (Rust-based — fast) |
| Build | Turbo, tsdown |

---

## Architecture Patterns

### Event-Sourcing (Commands → Events → Projections)
- `apps/server/src/orchestration/decider.ts` — validates commands, emits events
- `apps/server/src/orchestration/projector.ts` — applies events to state
- All domain events persisted to SQLite; use for undo/restore/audit

### Effect Layers (Dependency Injection)
- Services composed via `Effect.Layer` — no global state
- `apps/server/src/serverLayers.ts` — wires all layers at boot
- Swap implementations per layer for tests

### DrainableWorker (Queue-Based Async)
- `packages/shared/src/DrainableWorker.ts`
- Use for ordered async flows; `drain()` method for test synchronization
- Prevents race conditions in checkpoint capture, command processing

### WebSocket Protocol
- Server pushes typed events on channels: `server.welcome`, `orchestration.domainEvent`, `terminal.event`
- Client (`apps/web/src/wsTransport.ts`) manages connection states with auto-reconnect
- Outbound requests queued while disconnected, flushed on reconnect

### Provider Adapters
- Pluggable JSON-RPC over stdio: `apps/server/src/provider/`
- `ClaudeAdapter` and `CodexAdapter` normalize provider events to orchestration events

### Git Checkpointing
- Snapshots stored as hidden Git refs (`refs/helios/...`)
- Enables per-turn diffs and workspace restore
- `apps/server/src/checkpointing/`

---

## Important Conventions

### Package Imports
- `@helios-dev/contracts` — import types/schemas (Effect Schema, runtime-validated)
- `@helios-dev/shared` uses **subpath exports** (no barrel index):
  ```ts
  import { ... } from "@helios-dev/shared/git"
  import { DrainableWorker } from "@helios-dev/shared/DrainableWorker"
  ```

### File Naming
- `Layers/` — Effect Layer implementations (service wiring)
- `Services/` — Service interfaces and registries
- `Errors.ts` — Domain-specific error types per subsystem
- `*.test.ts` — Unit tests (Vitest, co-located with source)
- `*.browser.tsx` — Browser component tests (Playwright)
- `*.probe.test.ts` — Integration/probe tests

### TypeScript
- Target: ES2023, strict mode
- Base config: `tsconfig.base.json`
- All schemas defined via Effect Schema (provides both TS types AND runtime validation)

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `HELIOS_PORT` | Server port | `3773` |
| `HELIOS_STATE_DIR` | State storage path | `~/.helios/dev` (dev) |
| `HELIOS_DEV_INSTANCE` | Instance name (hashes to port offset) | — |
| `HELIOS_PORT_OFFSET` | Explicit numeric port offset | — |
| `HELIOS_AUTH_TOKEN` | WebSocket auth token | — |
| `HELIOS_NO_BROWSER` | Skip auto-opening browser | — |
| `HELIOS_LOG_WS_EVENTS` | Log WebSocket traffic (debug) | — |
| `HELIOS_MODE` | Runtime mode | — |
| `HELIOS_DESKTOP_WS_URL` | Desktop WS endpoint | — |
| `VITE_WS_URL` | WebSocket URL for web dev | — |
| `HELIOS_WEB_SOURCEMAP` | Sourcemap control (`true`/`false`/`hidden`) | — |

**User config files** (at runtime):
- `~/.helios/keybindings.json` — keybinding overrides
- `~/.helios/editor-preferences.json` — editor preferences

---

## Development Ports

- Server: `3773` (default)
- Web (Vite): `5733` (default)

To run multiple isolated instances on the same machine:
```bash
HELIOS_DEV_INSTANCE=feature-xyz bun run dev:desktop
```

---

## Testing

- Tests are **co-located** with source files (same directory)
- Effect-based tests use `Effect.runSync()` or promise unwrapping
- Browser tests run against headless Chromium via Playwright
- Aim for unit test coverage on all new server-side logic

```bash
# Run a specific test file
bun run vitest apps/server/src/orchestration/decider.test.ts

# Watch mode
bun run vitest --watch
```

---

## CI Pipeline (`.github/workflows/ci.yml`)

Order of checks: **fmt → lint → typecheck → test → test:browser → build**

All checks must pass before merging. The pipeline uses Bun lockfile + Turbo caching for speed.

---

## Common Pitfalls

1. **Don't use barrel imports from `@helios-dev/shared`** — use explicit subpaths
2. **Effect Schema for all shared types** — don't use plain TypeScript interfaces for cross-boundary data; use `contracts` package schemas
3. **Node.js version matters** — must be 24.13.1+; use `mise` or check `.mise.toml`
4. **Bun is the package manager** — do not use `npm` or `yarn`; `bun install` only
5. **Turbo caches builds** — run `bun run clean` if seeing stale build artifacts
6. **Dev state is isolated** — dev runs in `~/.helios/dev`, not `~/.helios`
7. **Format with oxfmt, not prettier** — `bun run fmt` to auto-fix before committing
