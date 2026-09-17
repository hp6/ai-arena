import { MAX_TURN_ACTIONS } from "@ai-arena/shared";

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
          description: "Actions in order. Each costs 1 AP. List one action per AP you have, plus extras only if you expect to earn AP this turn from a kill or the gold. Actions beyond your AP are skipped at no cost.",
          minItems: 1,
          maxItems: MAX_TURN_ACTIONS,
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
