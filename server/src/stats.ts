import type { GameFrame, MatchSummary, ModelStats, Stats } from "@ai-arena/shared";
import { listAllGames, getFramesAfter, setGameSummary, type GameRecord } from "./db/database.js";

const START_ELO = 1000;
const K_FACTOR = 32;

/**
 * Only winning a match earns rating. The winner is scored against each of the other three as a
 * head-to-head it won, and they are each scored as having lost to it; the losers are not rated
 * against each other, so finishing second is worth exactly as much as finishing last.
 *
 * Placement is deliberately not used. In a four-way free-for-all a fighter that does nothing is
 * carried up the finishing order by the others knocking each other out, which let a model that
 * failed most of its turns sit mid-table on placement alone.
 *
 * The K factor is split across the three pairings, so the winner's gain is still capped at
 * K_FACTOR and what it gains is exactly what the losers give up.
 */
function eloByModel(oldestFirst: MatchSummary[]): Map<string, number> {
  const elo = new Map<string, number>();
  const rating = (model: string) => elo.get(model) ?? START_ELO;

  for (const match of oldestFirst) {
    const players = match.fighters.filter((f) => f.placement !== null);
    if (players.length < 2) continue;

    const winner = players.find((f) => f.id === match.winnerId);
    // A match with no winner (everyone eliminated, or cut short) rates nobody
    if (!winner) continue;
    const losers = players.filter((f) => f !== winner);
    if (losers.length === 0) continue;

    const k = K_FACTOR / losers.length;
    let winnerDelta = 0;
    const loserDeltas = losers.map((loser) => {
      const expected = 1 / (1 + 10 ** ((rating(loser.model) - rating(winner.model)) / 400));
      winnerDelta += k * (1 - expected);
      // The loser's expectation against the winner is the complement of the winner's
      return k * (0 - (1 - expected));
    });

    // Applied together so everyone in a match is rated against the same starting numbers
    const updates: [string, number][] = [[winner.model, rating(winner.model) + winnerDelta]];
    losers.forEach((l, i) => updates.push([l.model, rating(l.model) + loserDeltas[i]]));
    for (const [model, value] of updates) elo.set(model, value);
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
