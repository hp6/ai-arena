import { Router } from "express";
import { startGame, getRunningGameIds, MAX_CONCURRENT_GAMES } from "../game/GameRunner.js";
import { type AgentConfig, createDefaultConfigs, PREFERRED_PROVIDERS } from "../ai/AgentConfig.js";
import { getGame, getFramesAfter, listGames, listAiCalls } from "../db/database.js";

const router = Router();

// Create a new game and start the AI loop in the background
router.post("/", (req, res) => {
  // Ids are registered as running before startGame returns, so this check can't race
  const running = getRunningGameIds();
  if (running.length >= MAX_CONCURRENT_GAMES) {
    res.status(409).json({
      error: `Already running ${running.length} games (limit ${MAX_CONCURRENT_GAMES})`,
      runningGameIds: running,
      runningGameId: running[0],
    });
    return;
  }

  let agents: AgentConfig[];
  if (req.body?.agents && Array.isArray(req.body.agents)) {
    agents = req.body.agents.map((a: any, i: number) => {
      const model = a.model || createDefaultConfigs()[i].model;
      return { fighterId: `fighter-${i}`, model, provider: a.provider ?? PREFERRED_PROVIDERS[model] };
    });
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

// Every AI request attempt for a game: prompts, request settings, raw reply, finish reason, usage and error
router.get("/:id/ai-calls", (req, res) => {
  const game = getGame(req.params.id);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json(listAiCalls(game.id));
});

export default router;
