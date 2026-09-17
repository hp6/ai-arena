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
      config TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS frames (
      game_id TEXT NOT NULL,
      frame_index INTEGER NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (game_id, frame_index),
      FOREIGN KEY (game_id) REFERENCES games(id)
    );
  `);

  // Mark any games that were still running when the server last shut down.
  db.prepare("UPDATE games SET status = 'interrupted' WHERE status = 'running'").run();
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
  };
}

export function updateGameStatus(gameId: string, status: "finished" | "interrupted", winner: string | null) {
  db.prepare("UPDATE games SET status = ?, winner = ? WHERE id = ?").run(status, winner, gameId);
}

export function listGames(): Omit<GameRecord, "agents">[] {
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
      agents: config.agents,
    };
  });
}
