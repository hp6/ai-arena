export const moveResponseSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "fighter_turn",
    strict: true,
    schema: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Brief explanation of your strategy this turn",
        },
        chat: {
          type: "string",
          description:
            "A short message to say in the global chat visible to all fighters. Trash talk, strategy comments, or reactions. Keep it brief and in character.",
        },
        actions: {
          type: "array",
          description: "List of actions to take this turn. You have 2 AP. Move costs 1 AP, attack costs 1 AP.",
          minItems: 1,
          maxItems: 2,
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["move", "attack", "wait"],
                description: "Action type",
              },
              targetX: {
                type: "integer",
                description: "Target grid X coordinate (for move action)",
              },
              targetY: {
                type: "integer",
                description: "Target grid Y coordinate (for move action)",
              },
              targetId: {
                type: "string",
                description: "Target fighter ID (for attack action)",
              },
            },
            required: ["type", "targetX", "targetY", "targetId"],
            additionalProperties: false,
          },
        },
      },
      required: ["reasoning", "chat", "actions"],
      additionalProperties: false,
    },
  },
};

export interface AIMoveResponse {
  reasoning: string;
  chat: string;
  actions: {
    type: "move" | "attack" | "wait";
    targetX: number;
    targetY: number;
    targetId: string;
  }[];
}
