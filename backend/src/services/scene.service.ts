import { generateJson } from "./ai/ollama.service.js";
import {
  ScenesSchema,
  type Scene,
} from "../schemas/scene.schema.js";
import { ScenesJsonSchema } from "../schemas/scene.json.js";

interface GenerateScenesInput {
  story: {
    title: string;
    logline: string;
    lesson: string;
  };

  characters: Array<{
    name: string;
    species: string;
    personality: string;
    description: string;
  }>;

  sceneCount?: number;
}

export async function generateScenes(
  input: GenerateScenesInput
): Promise<Scene[]> {

  const sceneCount = input.sceneCount ?? 5;

  const characters = input.characters
    .map(
      (character) =>
        `${character.name}: ${character.species}, ${character.personality}, ${character.description}`
    )
    .join("\n");

  const prompt = `
Create ${sceneCount} scenes for this children's story.

Title:
${input.story.title}

Story:
${input.story.logline}

Lesson:
${input.story.lesson}

Characters:
${characters}

Create exactly ${sceneCount} scenes.

Each scene must contain:

- sceneNumber
- description
- narration

Rules:
- Keep the characters consistent.
- Continue the story logically.
- Use simple language.
- Make each scene visually interesting.
- The description must be one or two complete visual sentences (20–40 words), not only a short title.
- Describe the characters' action, setting, mood, and a clear focal point for the illustration.
- Make narration different from the description; narration should be the short line spoken to the child.
- Keep narration short.
- No scary content.
- No violence.

Return ONLY valid JSON.
`;

  const parsed = await generateJson<unknown>(
    prompt,
    ScenesJsonSchema
  );

  return ScenesSchema.parse(parsed);
}
