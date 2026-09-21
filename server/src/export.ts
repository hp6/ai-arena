/**
 * Dumps the local match database to static JSON, shaped like the REST API so the
 * client can read it straight off a static host. Run it after playing matches:
 *
 *   cd server && npm run export
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import type { GameFrame } from "@ai-arena/shared";
import { initDb, listAllGames, getFramesAfter } from "./db/database.js";
import { computeStats } from "./stats.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.EXPORT_DIR ?? path.resolve(here, "../../client/public/data");

let files = 0;
let rawBytes = 0;
let gzBytes = 0;

function write(relativePath: string, value: unknown) {
  const file = path.join(OUT_DIR, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const json = Buffer.from(JSON.stringify(value));
  // Both forms: hosts that serve pre-compressed files can use the .gz, everyone else the plain one
  const gz = zlib.gzipSync(json, { level: 9 });
  fs.writeFileSync(file, json);
  fs.writeFileSync(`${file}.gz`, gz);
  files++;
  rawBytes += json.length;
  gzBytes += gz.length;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

/** Matches recorded before the format change repeat the whole conversation in every frame */
let saidSoFar = 0;
function compactChat(frame: GameFrame, index: number): GameFrame {
  if (index === 0) saidSoFar = 0;
  if (frame.chat || !frame.chatMessages) return frame;
  const { chatMessages, ...rest } = frame;
  const chat = chatMessages.slice(saidSoFar).map((m) => ({ fighterId: m.fighterId, text: m.text }));
  saidSoFar = chatMessages.length;
  return { ...rest, chat };
}

initDb();
fs.rmSync(OUT_DIR, { recursive: true, force: true });

const games = listAllGames().filter((g) => g.status !== "running");

write("stats.json", computeStats());
write(
  "games.json",
  games.map((g) => ({
    id: g.id,
    status: g.status,
    winner: g.winner,
    createdAt: g.createdAt,
    fighters: g.fighters,
    arena: g.arena,
  })),
);

for (const game of games) {
  write(`games/${game.id}.json`, {
    id: game.id,
    status: game.status,
    winner: game.winner,
    fighters: game.fighters,
    arena: game.arena,
    createdAt: game.createdAt,
  });

  const { frames, totalFrames } = getFramesAfter(game.id, -1);
  write(`games/${game.id}/frames.json`, { status: game.status, winner: game.winner, frames: frames.map(compactChat), totalFrames });
}

console.log(`Exported ${games.length} matches to ${OUT_DIR}`);
console.log(`${files} files, ${kb(rawBytes)} raw, ${kb(gzBytes)} gzipped`);
