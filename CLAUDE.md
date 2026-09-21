# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tiny AI Arena is a 2D top-down battle arena where AI agents (powered by different LLMs via OpenRouter) fight each other. Turn-based with Action Points (2 AP per turn, 1 AP per move/attack). Purely spectator — no human player controls. Global chat where fighters talk to each other. Games run in the background and are persisted to SQLite.

## Architecture

Monorepo with npm workspaces: `shared/`, `client/`, `server/`.

- **shared/** — TypeScript types, game constants, and action definitions used by both client and server. Imported as `@ai-arena/shared`.
- **client/** — Phaser 4 game (Vite + TypeScript). Renders the arena, fighters, HUD, game log, and chat. Polls server for new frames. Pure spectator — never drives game execution.
- **server/** — Express + TypeScript (tsx). Runs game logic in the background, writes frames to SQLite as they happen. Calls OpenRouter for AI decisions (API key server-side).

### Server Game Engine

- `server/src/game/GameRunner.ts` — Background game loop: runs AI turns, writes frames to SQLite, updates game status on completion
- `server/src/game/GameState.ts` — Game state factory, turn order shuffling, current fighter lookup
- `server/src/game/MoveValidator.ts` — Validates actions against game rules (adjacency, obstacles, AP cost, range)
- `server/src/game/CombatResolver.ts` — Damage calculation with variance
- `server/src/db/database.ts` — SQLite layer (better-sqlite3): games table, frames table, CRUD helpers
- `server/src/ai/OpenRouterClient.ts` — Calls OpenRouter with structured output schema, timeout/retry; reports a failure reason when no usable response
- `server/src/ai/PromptBuilder.ts` — Builds system + user prompts with full game state, valid moves, enemy distances
- `server/src/ai/MoveSchema.ts` — JSON schema for structured AI responses (reasoning, chat, actions)
- `server/src/ai/AgentConfig.ts` — Per-fighter model config and defaults
- `server/src/routes/game.ts` — REST API endpoints (create, list, metadata, frames)

### AI Models

`MODEL_POOL` in `server/src/ai/AgentConfig.ts` lists every model that can play; each new game draws 4 of them at random and assigns them to Crimson, Azure, Violet and Amber in that order. Models with a `provider` are pinned to it (the only one serving them with structured output support, or the fastest endpoint).

Currently: `deepseek/deepseek-v4-flash-0731` (Makora), `google/gemini-3.6-flash`, `anthropic/claude-sonnet-5`, `openai/gpt-5.6-luna-pro`, `anthropic/claude-fable-5.1` (Anthropic), `x-ai/grok-4.6` (xAI), `moonshotai/kimi-k2.6` (Baidu).

### API Endpoints

- `POST /api/games` — Create new game, start background AI loop, return game metadata. Up to `MAX_CONCURRENT_GAMES` (default 3, env-overridable) run at once; returns 409 with `runningGameIds` when that limit is reached
- `GET /api/games` — List recent games (id, status, fighters, timestamps)
- `GET /api/games/:id` — Get game metadata (fighters, arena, status, winner)
- `GET /api/games/:id/frames?after=N` — Poll for frames after index N (returns new frames + game status)
- `GET /api/games/:id/ai-calls` — Every AI request attempt for a game (prompts, request settings, raw reply, finish reason, token usage, error) for debugging
- `GET /api/stats` — Totals, per-model leaderboard, and match history (computed from all games and frames)

### Database

SQLite via `better-sqlite3`, stored at `server/data/arena.db` (gitignored). Three tables:
- `games` — id, status (running/finished/interrupted), winner, created_at, config (JSON: fighters, arena, agents)
- `frames` — game_id, frame_index, data (JSON: GameFrame snapshot)
- `ai_calls` — one row per OpenRouter attempt: game_id, round, fighter_id, model, attempt, system/user prompt, request settings, http status, raw response, content, finish_reason, usage, error, duration

Games still running when the server restarts are marked `interrupted`.

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
- Kills and gold permanently add +1 AP per turn (usable immediately if the AI planned extra actions); kills also heal 50% max HP (no overheal). One gold per game, placed on the cell most equidistant from all spawns
- The AI plans its whole turn in one call and may list more actions than its AP for expected bonuses; actions beyond available AP are skipped at no cost
- Sequential turns with **randomized turn order each round** (shuffled at round start)
- Server is authoritative — all move validation happens server-side
- **Games run in the background** — client is purely a spectator that polls for frames
- **Frames persisted to SQLite** — games survive server restarts and can be replayed anytime
- AI uses structured output (`response_format` with `json_schema`, `strict: true`) for reliable move parsing
- AI system prompt includes valid moves, enemy distances, and recent chat for context
- 90s timeout and 4000 max_tokens per AI call (reasoning tokens count toward the limit), one retry on transient errors; if the model still gives no usable response the fighter waits (turn skipped, reason logged). No bot ever plays for a model
- Client polls every 1.5s for new frames while game is running
- `@ai-arena/shared` is resolved via Vite alias + tsconfig paths (no build step needed)
- OpenRouter API key stored in `.env` as `OR_KEY`
- Dead players cannot chat
- Fighter names display their model (e.g. "Crimson [deepseek-v4-flash-0731]"), so which model plays which colour changes per game
- Leaderboard ranks by Elo (start 1000, each match scored as a round-robin by finishing place), which stays fair when models have played different numbers of matches

## Game Constants

All balance values are in `shared/src/constants.ts` — AP costs, damage, grid dimensions (8x8 playable grid), fighter colors, spawn positions, obstacle count (rocks are placed randomly per game), and chat length limit (50 chars). Change them there to rebalance.
