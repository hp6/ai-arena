export const moveResponseSchema = {
  type: "json_schema" as const,
  json_schema: {
    name: "fighter_turn",
    strict: true,
    schema: {
      type: "object",
      properties: {
        chat: {
          type: "string",
          description: "Optional message for the global chat visible to all fighters.",
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
      required: ["chat", "actions"],
      additionalProperties: false,
    },
  },
};

export interface AIMoveResponse {
  chat: string;
  actions: {
    type: "move" | "attack" | "wait";
    targetX: number;
    targetY: number;
    targetId: string;
  }[];
}
