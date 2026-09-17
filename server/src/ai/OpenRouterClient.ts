import type { GameState } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { moveResponseSchema, type AIMoveResponse } from "./MoveSchema.js";
import { buildSystemPrompt, buildUserPrompt } from "./PromptBuilder.js";
import { generateRandomActions, generateChatMessage } from "./RandomBot.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 30000;

export interface AIResult {
  actions: Action[];
  chatMessage: string | null;
  model: string;
  fallback: boolean;
}

export async function getAIMove(
  state: GameState,
  fighterId: string,
  model: string,
): Promise<AIResult> {
  const apiKey = process.env.OR_KEY;
  if (!apiKey) {
    console.warn("No OR_KEY set, falling back to random bot");
    return fallbackResult(state, fighterId, model);
  }

  const systemPrompt = buildSystemPrompt(state, fighterId);
  const userPrompt = buildUserPrompt(state, fighterId);

  const fighter = state.fighters.find((f) => f.id === fighterId)!;
  console.log(`[AI] Requesting move for ${fighter.name} from ${model}...`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const resp = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ai-arena.local",
          "X-OpenRouter-Title": "Tiny AI Arena",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: moveResponseSchema,
          temperature: 0.7,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        const errorText = await resp.text();
        console.error(`[AI] HTTP ${resp.status} from OpenRouter (attempt ${attempt + 1}):`, errorText);
        if (resp.status === 429 || resp.status >= 500) continue;
        return fallbackResult(state, fighterId, model);
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error(`[AI] Empty response from ${model} (attempt ${attempt + 1})`);
        continue;
      }

      const parsed: AIMoveResponse = JSON.parse(content);
      const actions = convertActions(parsed);

      return {
        actions,
        chatMessage: parsed.chat || null,
        model,
        fallback: false,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.error(`[AI] Timeout for ${fighter.name} (${model}), attempt ${attempt + 1}`);
      } else {
        console.error(`[AI] Error for ${fighter.name} (${model}), attempt ${attempt + 1}:`, err.message);
      }
    }
  }

  console.warn(`[AI] All attempts failed for ${fighter.name}, falling back to random bot`);
  return fallbackResult(state, fighterId, model);
}

function convertActions(response: AIMoveResponse): Action[] {
  return response.actions.map((a) => {
    switch (a.type) {
      case "move":
        return { type: "move" as const, targetPosition: { x: a.targetX, y: a.targetY } };
      case "attack":
        return { type: "attack" as const, targetId: a.targetId };
      case "wait":
        return { type: "wait" as const };
      default:
        return { type: "wait" as const };
    }
  });
}

function fallbackResult(state: GameState, fighterId: string, model: string): AIResult {
  const actions = generateRandomActions(state, fighterId);
  const chatMessage = generateChatMessage(state, fighterId, actions);
  return {
    actions,
    chatMessage,
    model,
    fallback: true,
  };
}
