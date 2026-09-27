import type { GameFrame, MatchSummary, ModelStats, Stats } from "@ai-arena/shared";
import { listAllGames, getFramesAfter, setGameSummary, type GameRecord } from "./db/database.js";

const START_ELO = 1000;
const K_FACTOR = 32;

/**
 * Each match is scored as a mini round-robin: every pair of fighters is a head-to-head
 * decided by finishing place, and the K factor is split across those pairings.
 */
function eloByModel(oldestFirst: MatchSummary[]): Map<string, number> {
  const elo = new Map<string, number>();
  const rating = (model: string) => elo.get(model) ?? START_ELO;

  for (const match of oldestFirst) {
    const players = match.fighters.filter((f) => f.placement !== null);
    if (players.length < 2) continue;

    const k = K_FACTOR / (players.length - 1);
    const deltas = players.map((a) =>
      players.reduce((sum, b) => {
        if (a === b) return sum;
        const expected = 1 / (1 + 10 ** ((rating(b.model) - rating(a.model)) / 400));
        const score = a.placement! < b.placement! ? 1 : a.placement! === b.placement! ? 0.5 : 0;
        return sum + k * (score - expected);
      }, 0),
    );
    // Applied together so everyone in a match is rated against the same starting numbers
    players.forEach((p, i) => elo.set(p.model, rating(p.model) + deltas[i]));
  }

  return elo;
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
        m = { model: f.model, fighterId: f.id, color: f.color, elo: START_ELO, played: 0, wins: 0, winRate: 0, kills: 0, damageDealt: 0, damageTaken: 0, avgPlacement: 0, placementSum: 0 };
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

  const elo = eloByModel([...matches].reverse());
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
      .map(({ placementSum, ...m }) => ({
        ...m,
        elo: Math.round(elo.get(m.model) ?? START_ELO),
        winRate: m.wins / m.played,
        avgPlacement: placementSum / m.played,
      }))
      .sort((a, b) => b.elo - a.elo || b.wins - a.wins || a.avgPlacement - b.avgPlacement),
    matches,
  };
}
