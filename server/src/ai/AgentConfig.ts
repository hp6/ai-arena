export interface AgentConfig {
  fighterId: string;
  model: string;
  /** Preferred OpenRouter provider, e.g. "BaseTen". Other providers are still used if it is unavailable. */
  provider?: string;
}

export const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash-0731",
  "google/gemini-3.6-flash",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-luna-pro",
];

// Some deepseek endpoints run at ~30 tokens/s, slow enough to hit the request timeout; Makora served it at ~130
export const PREFERRED_PROVIDERS: Record<string, string> = {
  "deepseek/deepseek-v4-flash-0731": "Makora",
};

export function createDefaultConfigs(): AgentConfig[] {
  return DEFAULT_MODELS.map((model, i) => ({
    fighterId: `fighter-${i}`,
    model,
    provider: PREFERRED_PROVIDERS[model],
  }));
}
