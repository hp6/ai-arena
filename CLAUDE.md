# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Arena is a 2D top-down battle arena where AI agents (powered by different LLMs via OpenRouter) fight each other. Turn-based with Action Points (2 AP per turn, 1 AP per move/attack). Purely spectator — no human player controls. Global chat where fighters talk to each other.

## Architecture

Monorepo with npm workspaces: `shared/`, `client/`, `server/`.

- **shared/** — TypeScript types, game constants, and action definitions used by both client and server. Imported as `@ai-arena/shared`.
- **client/** — Phaser 4 game (Vite + TypeScript). Renders the arena, fighters, HUD, game log, and chat. Communicates with server via HTTP. Frame-based replay with forward/backward stepping.
- **server/** — Express + TypeScript (tsx). Authoritative game state manager. Runs game logic, validates moves, resolves combat. Calls OpenRouter for AI decisions (API key server-side).

### Server Game Engine

- `server/src/game/GameState.ts` — Game state factory, turn order shuffling, current fighter lookup
- `server/src/game/MoveValidator.ts` — Validates actions against game rules (adjacency, obstacles, AP cost, range)
- `server/src/game/CombatResolver.ts` — Damage calculation with variance
- `server/src/ai/OpenRouterClient.ts` — Calls OpenRouter with structured output schema, timeout/retry, fallback to RandomBot
- `server/src/ai/PromptBuilder.ts` — Builds system + user prompts with full game state, valid moves, enemy distances
- `server/src/ai/MoveSchema.ts` — JSON schema for structured AI responses (reasoning, chat, actions)
- `server/src/ai/AgentConfig.ts` — Per-fighter model config and defaults
- `server/src/ai/RandomBot.ts` — Fallback bot for when AI calls fail
- `server/src/routes/game.ts` — API endpoints, per-action stepping, full game execution

### Default AI Models

- Fighter 0 (Crimson): `deepseek/deepseek-v4-flash-0731`
- Fighter 1 (Azure): `google/gemini-3.6-flash`
- Fighter 2 (Emerald): `anthropic/claude-sonnet-5`
- Fighter 3 (Amber): `openai/gpt-5.6-luna-pro`

### API Endpoints

- `POST /api/game/create` — Create new game (accepts optional `agents` array with `{model, personality}`)
- `GET /api/game/:id/state` — Get current state
- `POST /api/game/:id/step` — Execute one action via AI agent, returns state + log entry
- `POST /api/game/:id/run` — Run entire game to completion via AI, returns final state

## Commands

```bash
# Install all dependencies (from repo root)
npm install

# Run server (port 3001)
cd server && npm run dev

# Run client dev server
cd client && npm run dev

# Type-check
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

## Key Design Decisions

- 2 AP per turn: move costs 1, attack costs 1. Adjacent cells only for both.
- Sequential turns with **randomized turn order each round** (shuffled at round start)
- Server is authoritative — all move validation happens server-side
- AI uses structured output (`response_format` with `json_schema`, `strict: true`) for reliable move parsing
- AI system prompt includes valid moves, enemy distances, and recent chat for context
- 30s timeout per AI call, one retry on transient errors, fallback to RandomBot
- Client stores frame snapshots for backward navigation (no server call needed)
- `@ai-arena/shared` is resolved via Vite alias + tsconfig paths (no build step needed)
- OpenRouter API key stored in `.env` as `OR_KEY`
- Dead players cannot chat
- Fighter names display their model (e.g. "Crimson [deepseek-v4-flash-0731]")

## Game Constants

All balance values are in `shared/src/constants.ts` — AP costs, damage, grid dimensions (12x12 square grid), fighter colors, spawn positions, obstacle layout, and chat length limit (50 chars). Change them there to rebalance.
