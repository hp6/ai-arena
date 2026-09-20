import type { GameState } from "@ai-arena/shared";
import type { Action } from "@ai-arena/shared";
import { moveResponseSchema, type AIMoveResponse } from "./MoveSchema.js";
import { buildSystemPrompt, buildUserPrompt } from "./PromptBuilder.js";
import { insertAiCall } from "../db/database.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Reasoning models can take 30s+ on a turn
const TIMEOUT_MS = 90000;
const MAX_ATTEMPTS = 2;

export interface AIResult {
  actions: Action[];
  chatMessage: string | null;
  model: string;
  /** Why no usable response was produced; the fighter just waits this turn */
  failure: string | null;
}

export async function getAIMove(
  state: GameState,
  fighterId: string,
  model: string,
  provider?: string,
): Promise<AIResult> {
  const apiKey = process.env.OR_KEY;
  if (!apiKey) {
    return noResponse(model, "OR_KEY not set");
  }

  const systemPrompt = buildSystemPrompt(state, fighterId);
  const userPrompt = buildUserPrompt(state, fighterId);
  const request = {
    model,
    // Preferred provider first, but fallbacks stay on: Makora is the fastest endpoint yet rate-limits after a call or two
    ...(provider ? { provider: { order: [provider] } } : {}),
    response_format: moveResponseSchema,
    temperature: 0.7,
    // Hidden reasoning counts against max_tokens; at 500 deepseek and gemini spent it all thinking and the JSON got cut off
    max_tokens: 4000,
  };

  const fighter = state.fighters.find((f) => f.id === fighterId)!;
  console.log(`[AI] Requesting move for ${fighter.name} from ${model}...`);

  let lastFailure = "no response";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    // Every attempt is saved to ai_calls, successful or not, so prompts and raw replies can be inspected later
    const call = {
      gameId: state.id,
      round: state.round,
      fighterId,
      model,
      attempt,
      systemPrompt,
      userPrompt,
      request,
      httpStatus: null as number | null,
      rawResponse: null as string | null,
      content: null as string | null,
      finishReason: null as string | null,
      usage: null as unknown,
      error: null as string | null,
    };
    let retry = true;
    let result: AIResult | null = null;

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
          ...request,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      call.httpStatus = resp.status;
      call.rawResponse = await resp.text();
      clearTimeout(timeout);

      if (!resp.ok) {
        call.error = `HTTP ${resp.status}`;
        retry = resp.status === 429 || resp.status >= 500;
      } else {
        const data = JSON.parse(call.rawResponse);
        call.content = data.choices?.[0]?.message?.content ?? null;
        call.finishReason = data.choices?.[0]?.finish_reason ?? null;
        call.usage = data.usage ?? null;

        if (!call.content) {
          call.error = "empty response";
        } else {
          try {
            const parsed: AIMoveResponse = JSON.parse(call.content);
            result = { actions: convertActions(parsed), chatMessage: parsed.chat || null, model, failure: null };
          } catch {
            call.error = "invalid JSON";
          }
        }
      }
    } catch (err: any) {
      call.error = err.name === "AbortError" ? "timed out" : err instanceof SyntaxError ? "invalid JSON" : err.message;
    }

    insertAiCall({ ...call, durationMs: Date.now() - started });
    if (result) return result;

    lastFailure = call.error ?? lastFailure;
    console.error(
      `[AI] ${fighter.name} (${model}) attempt ${attempt} failed: ${lastFailure}` +
        (call.finishReason ? ` [finish_reason=${call.finishReason}]` : ""),
    );
    if (!retry) break;
  }

  console.warn(`[AI] All attempts failed for ${fighter.name}, waiting this turn (${lastFailure})`);
  return noResponse(model, lastFailure);
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

function noResponse(model: string, failure: string): AIResult {
  return { actions: [], chatMessage: null, model, failure };
}
