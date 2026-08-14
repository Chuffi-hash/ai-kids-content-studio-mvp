import { generateJson } from "./ai/ollama.service.js";
import { StoryJsonSchema } from "../schemas/story.json.js";
import {
  StorySchema,
  type Story,
} from "../schemas/story.schema.js";

export interface StoryRequest {
  topic: string;
  ageGroup: string;
  lesson?: string;
}

export async function generateStory(
  input: StoryRequest
): Promise<Story & { id: string }> {

  const prompt = `
Create an original children's story concept.

Topic:
${input.topic}

Age group:
${input.ageGroup}

Lesson:
${input.lesson ?? "Make the story positive and educational."}

Create:

- A short title
- A one sentence logline
- A clear lesson
- 2-3 original characters

Rules:
- Use simple language.
- Characters must be suitable for children.
- No violence.
- No scary content.
- Do not use copyrighted characters.
- Keep characters consistent.
- Do NOT create scenes.
- Do NOT create narration.

Return ONLY valid JSON.
`;

  const parsed = await generateJson<unknown>(
    prompt,
    StoryJsonSchema
  );
  console.log(
    "Parsed Ollama response:",
    JSON.stringify(parsed, null, 2)
  );
  const story = StorySchema.parse(parsed);

  return {
    id: crypto.randomUUID(),
    ...story,
  };
}