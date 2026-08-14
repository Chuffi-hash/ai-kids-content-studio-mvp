export const StoryJsonSchema = {
  type: "object",

  properties: {
    title: {
      type: "string",
    },

    logline: {
      type: "string",
    },

    lesson: {
      type: "string",
    },

    characters: {
      type: "array",

      items: {
        type: "object",

        properties: {
          name: {
            type: "string",
          },

          species: {
            type: "string",
          },

          personality: {
            type: "string",
          },

          description: {
            type: "string",
          },
        },

        required: [
          "name",
          "species",
          "personality",
          "description",
        ],
      },
    },
  },

  required: [
    "title",
    "logline",
    "lesson",
    "characters",
  ],
} as const;