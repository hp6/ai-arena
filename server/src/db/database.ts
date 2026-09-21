import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { GameFrame, FighterState, ArenaConfig } from "@ai-arena/shared";
import type { AgentConfig } from "../ai/AgentConfig.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(here, "../../data/arena.db");

let db: Database.Database;

export interface GameRecord {
  id: string;
  status: "running" | "finished" | "interrupted";
  winner: string | null;
  createdAt: string;
  fighters: FighterState[];
  arena: ArenaConfig;
  agents: AgentConfig[];
  /** Cached match summary JSON, written once the game is over so stats don't re-read its frames */
  summaryJson: string | null;
}

export function initDb(): void {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'running',
      winner TEXT,
      created_at TEXT NOT NULL,
      config TEXT NOT NULL,
      summary TEXT
    );

    CREATE TABLE IF NOT EXISTS frames (
      game_id TEXT NOT NULL,
      frame_index INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (game_id, frame_index),
      FOREIGN KEY (game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS ai_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      round INTEGER NOT NULL,
      fighter_id TEXT NOT NULL,
      model TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      system_prompt TEXT NOT NULL,
      user_prompt TEXT NOT NULL,
      request TEXT NOT NULL,
      http_status INTEGER,
      raw_response TEXT,
      content TEXT,
      finish_reason TEXT,
      usage TEXT,
      error TEXT,
      FOREIGN KEY (game_id) REFERENCES games(id)
    );
    CREATE INDEX IF NOT EXISTS ai_calls_game ON ai_calls (game_id, id);
  `);

  const columns = db.prepare("PRAGMA table_info(games)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "summary")) {
    db.exec("ALTER TABLE games ADD COLUMN summary TEXT");
  }

}

/**
 * Crash recovery for the game server only: a game left marked running belongs to a process
 * that is gone. Other tools (the exporter, scripts) must not call this — it would flag
 * matches that are alive and playing in the server process.
 */
export function markAbandonedGamesInterrupted(): number {
  return db.prepare("UPDATE games SET status = 'interrupted' WHERE status = 'running'").run().changes;
}

export function getNextGameId(): number {
  const row = db.prepare("SELECT id FROM games ORDER BY rowid DESC LIMIT 1").get() as { id: string } | undefined;
  if (!row) return 1;
  const num = parseInt(row.id.replace("game-", ""), 10);
  return (isNaN(num) ? 0 : num) + 1;
}

export function createGameRecord(
  id: string,
  fighters: FighterState[],
  arena: ArenaConfig,
  agents: AgentConfig[],
) {
  const config = JSON.stringify({ fighters, arena, agents });
  db.prepare("INSERT INTO games (id, status, created_at, config) VALUES (?, 'running', ?, ?)").run(
    id,
    new Date().toISOString(),
    config,
  );
}

export function insertFrame(gameId: string, frameIndex: number, frame: GameFrame) {
  db.prepare("INSERT INTO frames (game_id, frame_index, data) VALUES (?, ?, ?)").run(
    gameId,
    frameIndex,
    JSON.stringify(frame),
  );
}

export function getFramesAfter(
  gameId: string,
  after: number,
): { frames: GameFrame[]; totalFrames: number } {
  const frames = db
    .prepare("SELECT data FROM frames WHERE game_id = ? AND frame_index > ? ORDER BY frame_index")
    .all(gameId, after) as { data: string }[];

  const total = db
    .prepare("SELECT COUNT(*) as count FROM frames WHERE game_id = ?")
    .get(gameId) as { count: number };

  return {
    frames: frames.map((r) => JSON.parse(r.data)),
    totalFrames: total?.count ?? 0,
  };
}

export function getGame(gameId: string): GameRecord | null {
  const row = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as {
    id: string;
    status: string;
    winner: string | null;
    created_at: string;
    config: string;
    summary: string | null;
  } | undefined;

  if (!row) return null;

  const config = JSON.parse(row.config);
  return {
    id: row.id,
    status: row.status as GameRecord["status"],
    winner: row.winner,
    createdAt: row.created_at,
    fighters: config.fighters,
    arena: config.arena,
    agents: config.agents,
    summaryJson: row.summary,
  };
}

export function updateGameStatus(gameId: string, status: "finished" | "interrupted", winner: string | null) {
  db.prepare("UPDATE games SET status = ?, winner = ? WHERE id = ?").run(status, winner, gameId);
}

export function setGameSummary(gameId: string, summaryJson: string) {
  db.prepare("UPDATE games SET summary = ? WHERE id = ?").run(summaryJson, gameId);
}

export function listGames(): Omit<GameRecord, "agents" | "summaryJson">[] {
  const rows = db
    .prepare("SELECT * FROM games ORDER BY created_at DESC LIMIT 50")
    .all() as { id: string; status: string; winner: string | null; created_at: string; config: string }[];

  return rows.map((row) => {
    const config = JSON.parse(row.config);
    return {
      id: row.id,
      status: row.status as GameRecord["status"],
      winner: row.winner,
      createdAt: row.created_at,
      fighters: config.fighters,
      arena: config.arena,
    };
  });
}

export function listAllGames(): GameRecord[] {
  const rows = db
    .prepare("SELECT * FROM games ORDER BY created_at DESC")
    .all() as { id: string; status: string; winner: string | null; created_at: string; config: string; summary: string | null }[];

  return rows.map((row) => {
    const config = JSON.parse(row.config);
    return {
      id: row.id,
      status: row.status as GameRecord["status"],
      winner: row.winner,
      createdAt: row.created_at,
      fighters: config.fighters,
      arena: config.arena,
      agents: config.agents,
      summaryJson: row.summary,
    };
  });
}

export interface AiCallRecord {
  gameId: string;
  round: number;
  fighterId: string;
  model: string;
  attempt: number;
  durationMs: number;
  systemPrompt: string;
  userPrompt: string;
  /** Request body without the messages (model, temperature, max_tokens, schema) */
  request: unknown;
  httpStatus: number | null;
  rawResponse: string | null;
  content: string | null;
  finishReason: string | null;
  usage: unknown;
  error: string | null;
}

export function insertAiCall(call: AiCallRecord) {
  db.prepare(
    `INSERT INTO ai_calls (game_id, round, fighter_id, model, attempt, created_at, duration_ms, system_prompt, user_prompt,
       request, http_status, raw_response, content, finish_reason, usage, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    call.gameId,
    call.round,
    call.fighterId,
    call.model,
    call.attempt,
    new Date().toISOString(),
    call.durationMs,
    call.systemPrompt,
    call.userPrompt,
    JSON.stringify(call.request),
    call.httpStatus,
    call.rawResponse,
    call.content,
    call.finishReason,
    call.usage === undefined || call.usage === null ? null : JSON.stringify(call.usage),
    call.error,
  );
}

export function listAiCalls(gameId: string) {
  const rows = db.prepare("SELECT * FROM ai_calls WHERE game_id = ? ORDER BY id").all(gameId) as Record<string, any>[];
  return rows.map((r) => ({
    id: r.id,
    round: r.round,
    fighterId: r.fighter_id,
    model: r.model,
    attempt: r.attempt,
    createdAt: r.created_at,
    durationMs: r.duration_ms,
    ok: r.error === null,
    error: r.error,
    httpStatus: r.http_status,
    finishReason: r.finish_reason,
    usage: r.usage ? JSON.parse(r.usage) : null,
    content: r.content,
    systemPrompt: r.system_prompt,
    userPrompt: r.user_prompt,
    request: JSON.parse(r.request),
    rawResponse: r.raw_response,
  }));
}
