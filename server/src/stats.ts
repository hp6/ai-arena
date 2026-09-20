import type { GameFrame } from "@ai-arena/shared";
import { listAllGames, getFramesAfter, setGameSummary, type GameRecord } from "./db/database.js";

export interface MatchFighter {
  id: string;
  name: string;
  model: string;
  color: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  placement: number | null;
}

export interface MatchSummary {
  id: string;
  status: GameRecord["status"];
  createdAt: string;
  rounds: number;
  turns: number;
  winnerId: string | null;
  fighters: MatchFighter[];
}

export interface ModelStats {
  model: string;
  fighterId: string;
  color: number;
  played: number;
  wins: number;
  winRate: number;
  kills: number;
  damageDealt: number;
  damageTaken: number;
  avgPlacement: number;
}

export interface Stats {
  totals: { games: number; finished: number; running: number; interrupted: number; avgRounds: number };
  models: ModelStats[];
  matches: MatchSummary[];
}

function summarize(game: GameRecord, frames: GameFrame[]): MatchSummary {
  const n = game.fighters.length;
  const kills = new Array(n).fill(0);
  const dealt = new Array(n).fill(0);
  const taken = new Array(n).fill(0);
  const eliminated: number[] = [];
  let rounds = 0;
  let turns = 0;

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    rounds = Math.max(rounds, frame.logEntry.round);
    if (i === 0 || frame.logEntry.actionType !== "attack") continue;

    turns++;
    const prev = frames[i - 1];
    const attacker = game.fighters.findIndex((f) => f.id === frame.logEntry.fighterId);
    for (let j = 0; j < n; j++) {
      const dmg = prev.fighters[j].hp - frame.fighters[j].hp;
      if (dmg <= 0) continue;
      taken[j] += dmg;
      if (attacker >= 0) dealt[attacker] += dmg;
      if (prev.fighters[j].alive && !frame.fighters[j].alive) {
        if (attacker >= 0) kills[attacker]++;
        eliminated.push(j);
      }
    }
  }
  turns += frames.filter((f) => f.logEntry.actionType === "move" || f.logEntry.actionType === "wait").length;

  const finished = game.status === "finished";
  const placement = (j: number): number | null => {
    if (!finished) return null;
    const out = eliminated.indexOf(j);
    return out === -1 ? 1 : n - out;
  };

  return {
    id: game.id,
    status: game.status,
    createdAt: game.createdAt,
    rounds,
    turns,
    winnerId: game.winner,
    fighters: game.fighters.map((f, j) => ({
      id: f.id,
      name: f.name,
      model: game.agents?.find((a) => a.fighterId === f.id)?.model ?? f.name,
      color: f.color,
      kills: kills[j],
      damageDealt: dealt[j],
      damageTaken: taken[j],
      placement: placement(j),
    })),
  };
}

export function computeStats(): Stats {
  const games = listAllGames();
  const models = new Map<string, ModelStats & { placementSum: number }>();
  const matches: MatchSummary[] = [];
  let roundsSum = 0;

  for (const game of games) {
    // Finished matches never change, so their summary is computed once and cached on the games row
    let match: MatchSummary;
    if (game.summaryJson) {
      match = JSON.parse(game.summaryJson);
    } else {
      match = summarize(game, getFramesAfter(game.id, -1).frames);
      if (game.status !== "running") setGameSummary(game.id, JSON.stringify(match));
    }
    matches.push(match);
    if (game.status !== "finished") continue;

    roundsSum += match.rounds;
    match.fighters.forEach((f) => {
      let m = models.get(f.model);
      if (!m) {
        // Games are newest-first, so slot and color come from the model's latest match
        m = { model: f.model, fighterId: f.id, color: f.color, played: 0, wins: 0, winRate: 0, kills: 0, damageDealt: 0, damageTaken: 0, avgPlacement: 0, placementSum: 0 };
        models.set(f.model, m);
      }
      m.played++;
      if (game.winner === f.id) m.wins++;
      m.kills += f.kills;
      m.damageDealt += f.damageDealt;
      m.damageTaken += f.damageTaken;
      m.placementSum += f.placement ?? 0;
    });
  }

  const finished = games.filter((g) => g.status === "finished").length;
  return {
    totals: {
      games: games.length,
      finished,
      running: games.filter((g) => g.status === "running").length,
      interrupted: games.filter((g) => g.status === "interrupted").length,
      avgRounds: finished ? roundsSum / finished : 0,
    },
    models: [...models.values()]
      .map(({ placementSum, ...m }) => ({ ...m, winRate: m.wins / m.played, avgPlacement: placementSum / m.played }))
      .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.avgPlacement - b.avgPlacement),
    matches,
  };
}
