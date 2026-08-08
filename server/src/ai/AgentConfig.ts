export interface AgentConfig {
  fighterId: string;
  model: string;
  personality?: string;
}

export const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash-0731",
  "google/gemini-3.6-flash",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-luna-pro",
];

export const DEFAULT_PERSONALITIES = [
  "You are aggressive and always look for the closest enemy to attack. You trash talk a lot.",
  "You are strategic and methodical. You plan your moves carefully and try to position yourself for advantage.",
  "You are calm and analytical. You assess the battlefield before making decisions.",
  "You are bold and unpredictable. You like to surprise your opponents with unexpected moves.",
];

export function createDefaultConfigs(): AgentConfig[] {
  return DEFAULT_MODELS.map((model, i) => ({
    fighterId: `fighter-${i}`,
    model,
    personality: DEFAULT_PERSONALITIES[i],
  }));
}
