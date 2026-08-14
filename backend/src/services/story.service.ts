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
  audience?: string;
  genre?: string;
  visualStyle?: string;
}

export async function generateStory(
  input: StoryRequest
): Promise<Story & { id: string }> {

  const prompt = `
Create an original story concept.

Topic:
${input.topic}

Age group:
${input.ageGroup}

${input.audience ? `Audience:\n${input.audience}\n` : ''}
${input.genre ? `Genre:\n${input.genre}\n` : ''}
${input.visualStyle ? `Visual Style:\n${input.visualStyle}\n` : ''}

Lesson:
${input.lesson ?? "Make the story positive and educational."}

Create:

- A short title
- A one sentence logline
- A clear lesson
- 2-3 original characters

Rules:
- Use language appropriate for the specified audience.
- Characters must be suitable for the target audience.
- No violence unless appropriate for the genre.
- No scary content unless appropriate for the genre.
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