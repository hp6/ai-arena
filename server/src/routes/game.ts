import { Router } from "express";
import { startGame, getRunningGameId } from "../game/GameRunner.js";
import { type AgentConfig, createDefaultConfigs } from "../ai/AgentConfig.js";
import { getGame, getFramesAfter, listGames } from "../db/database.js";

const router = Router();

// Create a new game and start the AI loop in the background
router.post("/", (req, res) => {
  // One match at a time; the id is registered as running before startGame returns, so this check can't race
  const runningGameId = getRunningGameId();
  if (runningGameId) {
    res.status(409).json({ error: "A game is already running", runningGameId });
    return;
  }

  let agents: AgentConfig[];
  if (req.body?.agents && Array.isArray(req.body.agents)) {
    agents = req.body.agents.map((a: any, i: number) => ({
      fighterId: `fighter-${i}`,
      model: a.model || createDefaultConfigs()[i].model,
    }));
  } else {
    agents = createDefaultConfigs();
  }

  const gameId = startGame(agents);
  const game = getGame(gameId)!;

  res.json({
    id: game.id,
    status: game.status,
    fighters: game.fighters,
    arena: game.arena,
    createdAt: game.createdAt,
  });
});

// List recent games
router.get("/", (_req, res) => {
  const games = listGames();
  res.json(games);
});

// Get game metadata
router.get("/:id", (req, res) => {
  const game = getGame(req.params.id);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json({
    id: game.id,
    status: game.status,
    winner: game.winner,
    fighters: game.fighters,
    arena: game.arena,
    createdAt: game.createdAt,
  });
});

// Poll for new frames
router.get("/:id/frames", (req, res) => {
  const game = getGame(req.params.id);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const after = parseInt(req.query.after as string ?? "-1", 10);
  const { frames, totalFrames } = getFramesAfter(game.id, after);

  res.json({
    status: game.status,
    winner: game.winner,
    frames,
    totalFrames,
  });
});

export default router;
