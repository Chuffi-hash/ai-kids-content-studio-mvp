export const SceneJsonSchema = {
  type: "object",

  properties: {
    sceneNumber: {
      type: "number",
    },

    description: {
      type: "string",
    },

    narration: {
      type: "string",
    },
  },

  required: [
    "sceneNumber",
    "description",
    "narration",
  ],
} as const;

export const ScenesJsonSchema = {
  type: "array",
  items: SceneJsonSchema,
} as const;
