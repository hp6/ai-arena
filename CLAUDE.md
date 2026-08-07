# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Arena is a 2D top-down battle arena where AI agents (powered by different LLMs via OpenRouter) fight each other. Turn-based with Action Points (2 AP per turn, 1 AP per move/attack). Purely spectator — no human player controls. Global chat where fighters talk to each other.

## Architecture

Monorepo with npm workspaces: `shared/`, `client/`, `server/`.

- **shared/** — TypeScript types, game constants, and action definitions used by both client and server. Imported as `@ai-arena/shared`.
- **client/** — Phaser 4 game (Vite + TypeScript). Renders the arena, fighters, HUD, game log, and chat. Communicates with server via HTTP. Frame-based replay with forward/backward stepping.
- **server/** — Express + TypeScript (tsx). Authoritative game state manager. Runs game logic, validates moves, resolves combat. Proxies OpenRouter API calls (keeps API key server-side).

### Server Game Engine

- `server/src/game/GameState.ts` — Game state factory, turn order shuffling, current fighter lookup
- `server/src/game/MoveValidator.ts` — Validates actions against game rules (adjacency, obstacles, AP cost, range)
- `server/src/game/CombatResolver.ts` — Damage calculation with variance
- `server/src/game/TurnManager.ts` — Turn sequencing (unused in Stage 2, logic moved to routes)
- `server/src/ai/RandomBot.ts` — Generates valid random moves + chat messages. Used as placeholder/fallback before AI integration
- `server/src/routes/game.ts` — API endpoints, per-action stepping, full game execution

### API Endpoints

- `POST /api/game/create` — Create new game, returns initial state
- `GET /api/game/:id/state` — Get current state
- `POST /api/game/:id/step` — Execute one action (server generates via bot), returns state + log entry
- `POST /api/game/:id/run` — Run entire game to completion, returns final state with full log

## Commands

```bash
# Install all dependencies (from repo root)
npm install

# Run server (port 3001)
cd server && npm run dev

# Run client dev server (port 3000)
cd client && npm run dev

# Type-check
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

## Key Design Decisions

- 2 AP per turn: move costs 1, attack costs 1. Adjacent cells only for both.
- Sequential turns with **randomized turn order each round** (shuffled at round start)
- Server is authoritative — all move validation happens server-side
- Client stores frame snapshots for backward navigation (no server call needed)
- `@ai-arena/shared` is resolved via Vite alias + tsconfig paths (no build step needed)
- Graphics primitives (circles, rectangles) used for all visuals — no sprite assets
- OpenRouter API key stored in `.env` as `OR_KEY`
- Dead players cannot chat

## Game Constants

All balance values are in `shared/src/constants.ts` — AP costs, damage, grid dimensions, fighter colors, spawn positions, and obstacle layout. Change them there to rebalance.
