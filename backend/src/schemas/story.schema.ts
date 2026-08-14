import { z } from "zod";

export const CharacterSchema = z.object({
  name: z.string(),
  species: z.string(),
  personality: z.string(),
  description: z.string(),
});

export const StorySchema = z.object({
  title: z.string(),
  logline: z.string(),
  lesson: z.string(),

  characters: z.array(CharacterSchema),
});

export type Character = z.infer<typeof CharacterSchema>;
export type Story = z.infer<typeof StorySchema>;