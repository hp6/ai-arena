export interface AgentConfig {
  fighterId: string;
  model: string;
  /** Preferred OpenRouter provider, e.g. "Anthropic". Other providers are still used if it is unavailable. */
  provider?: string;
}

export const FIGHTER_COUNT = 4;

/** Every model that can be drawn for a match; a match picks FIGHTER_COUNT of them at random */
export const MODEL_POOL: { model: string; provider?: string }[] = [
  // Some deepseek endpoints run at ~30 tokens/s, slow enough to hit the request timeout; Makora served it at ~130
  { model: "deepseek/deepseek-v4-flash-0731", provider: "Makora" },
  { model: "google/gemini-3.6-flash" },
  { model: "anthropic/claude-sonnet-5" },
  { model: "openai/gpt-5.6-luna-pro" },
  // Anthropic and Alibaba are the only providers of these two that support structured outputs
  { model: "anthropic/claude-fable-5.1", provider: "Anthropic" },
  // "SpaceXAI" is the model's brand; xAI is the provider serving it, and the cheapest one
  { model: "x-ai/grok-4.6", provider: "xAI" },
  { model: "moonshotai/kimi-k2.6", provider: "Baidu" },
];

export const PREFERRED_PROVIDERS: Record<string, string> = Object.fromEntries(
  MODEL_POOL.filter((m) => m.provider).map((m) => [m.model, m.provider!]),
);

export function createDefaultConfigs(): AgentConfig[] {
  const pool = [...MODEL_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, FIGHTER_COUNT).map((entry, i) => ({
    fighterId: `fighter-${i}`,
    model: entry.model,
    provider: entry.provider,
  }));
}
