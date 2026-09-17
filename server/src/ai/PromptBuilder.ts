import type { GameState } from "@ai-arena/shared";
import { MAX_AP, MOVE_COST, ATTACK_COST, ATTACK_RANGE, BASE_DAMAGE, DAMAGE_VARIANCE, MAX_CHAT_LENGTH } from "@ai-arena/shared";

export function buildSystemPrompt(state: GameState, fighterId: string): string {
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
- Plan both actions carefully to maximize damage or position yourself strategically

## CHAT
There is a global chat visible to all fighters. Maximum ${MAX_CHAT_LENGTH} characters.`;

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

Make your move. Return a chat message and your ${MAX_AP} actions.`;

  return prompt;
}
