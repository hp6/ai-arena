export interface AgentConfig {
  fighterId: string;
  model: string;
}

export const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash-0731",
  "google/gemini-3.6-flash",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-luna-pro",
];

export function createDefaultConfigs(): AgentConfig[] {
  return DEFAULT_MODELS.map((model, i) => ({
    fighterId: `fighter-${i}`,
    model,
  }));
}
