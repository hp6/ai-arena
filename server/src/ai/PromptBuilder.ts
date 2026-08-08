import type { GameState } from "@ai-arena/shared";
import { MAX_AP, MOVE_COST, ATTACK_COST, ATTACK_RANGE, BASE_DAMAGE, DAMAGE_VARIANCE, MAX_CHAT_LENGTH } from "@ai-arena/shared";

export function buildSystemPrompt(state: GameState, fighterId: string, personality?: string): string {
  const fighter = state.fighters.find((f) => f.id === fighterId)!;

  let prompt = `You are ${fighter.name}, a fighter in a 2D top-down battle arena. You must defeat all other fighters to win.

## RULES
- The arena is a ${state.arena.width}x${state.arena.height} grid (0-indexed, x=column, y=row)
- You have ${MAX_AP} Action Points (AP) per turn
- MOVE: costs ${MOVE_COST} AP, move to one adjacent cell (up/down/left/right, no diagonals)
- ATTACK: costs ${ATTACK_COST} AP, attack a fighter on an adjacent cell (manhattan distance ${ATTACK_RANGE})
- WAIT: costs 1 AP, do nothing
- Attacks deal ${BASE_DAMAGE} ± ${DAMAGE_VARIANCE} damage
- You cannot move onto obstacles or occupied cells
- You cannot attack yourself or dead fighters
- Turn order is randomized each round

## IMPORTANT
- For MOVE actions: set targetX and targetY to the destination cell. Set targetId to ""
- For ATTACK actions: set targetId to the target's fighter ID. Set targetX and targetY to 0
- For WAIT actions: set targetId to "", targetX and targetY to 0
- You MUST only move to cells adjacent to your current position (distance 1)
- Plan both actions carefully to maximize damage or position yourself strategically`;

  if (personality) {
    prompt += `\n\n## PERSONALITY\n${personality}`;
  }

  prompt += `\n\n## CHAT
You can send a message in the global chat that all fighters can see. Use it to trash talk, comment on strategy, react to the game state, or bluff. Maximum ${MAX_CHAT_LENGTH} characters. Be in character.`;

  return prompt;
}

export function buildUserPrompt(state: GameState, fighterId: string): string {
  const fighter = state.fighters.find((f) => f.id === fighterId)!;
  const enemies = state.fighters.filter((f) => f.id !== fighterId && f.isAlive);

  let prompt = `## YOUR STATUS
Fighter: ${fighter.name} (${fighter.id})
Position: (${fighter.position.x}, ${fighter.position.y})
HP: ${fighter.hp}/${fighter.maxHp}
AP: ${MAX_AP} (full)

## ENEMIES`;

  for (const enemy of enemies) {
    const dist = Math.abs(fighter.position.x - enemy.position.x) + Math.abs(fighter.position.y - enemy.position.y);
    const adjacent = dist <= ATTACK_RANGE ? "YES - CAN ATTACK" : "no";
    prompt += `\n- ${enemy.name} (${enemy.id}): pos (${enemy.position.x},${enemy.position.y}), HP ${enemy.hp}/${enemy.maxHp}, distance ${dist}, adjacent: ${adjacent}`;
  }

  // Show dead fighters too
  const dead = state.fighters.filter((f) => f.id !== fighterId && !f.isAlive);
  if (dead.length > 0) {
    prompt += `\n\nEliminated: ${dead.map((f) => f.name).join(", ")}`;
  }

  prompt += `\n\n## OBSTACLES (impassable cells)`;
  for (const obs of state.arena.obstacles) {
    prompt += `\n- (${obs.x}, ${obs.y})`;
  }

  // Show valid moves
  const dirs = [
    { dx: 0, dy: -1, name: "up" },
    { dx: 0, dy: 1, name: "down" },
    { dx: -1, dy: 0, name: "left" },
    { dx: 1, dy: 0, name: "right" },
  ];
  const obstacleSet = new Set(state.arena.obstacles.map((o) => `${o.x},${o.y}`));
  const occupiedSet = new Set(
    state.fighters.filter((f) => f.id !== fighterId && f.isAlive).map((f) => `${f.position.x},${f.position.y}`),
  );

  prompt += `\n\n## VALID MOVES FROM YOUR POSITION (${fighter.position.x},${fighter.position.y})`;
  for (const d of dirs) {
    const nx = fighter.position.x + d.dx;
    const ny = fighter.position.y + d.dy;
    if (nx < 0 || nx >= state.arena.width || ny < 0 || ny >= state.arena.height) {
      prompt += `\n- ${d.name} (${nx},${ny}): OUT OF BOUNDS`;
    } else if (obstacleSet.has(`${nx},${ny}`)) {
      prompt += `\n- ${d.name} (${nx},${ny}): OBSTACLE`;
    } else if (occupiedSet.has(`${nx},${ny}`)) {
      const who = state.fighters.find((f) => f.position.x === nx && f.position.y === ny);
      prompt += `\n- ${d.name} (${nx},${ny}): OCCUPIED by ${who?.name}`;
    } else {
      prompt += `\n- ${d.name} (${nx},${ny}): AVAILABLE`;
    }
  }

  // Recent chat context
  if (state.chat.length > 0) {
    const recentChat = state.chat.slice(-6);
    prompt += `\n\n## RECENT CHAT`;
    for (const msg of recentChat) {
      prompt += `\n${msg.fighterName}: ${msg.text}`;
    }
  }

  prompt += `\n\n## ROUND ${state.round}
${state.fighters.filter((f) => f.isAlive).length} fighters remaining.

Make your move. Return your reasoning, a chat message, and your ${MAX_AP} actions.`;

  return prompt;
}
