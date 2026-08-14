import { z } from "zod";

export const SceneSchema = z.object({
  sceneNumber: z.number(),
  description: z.string(),
  narration: z.string(),
});

export const ScenesSchema = z.array(SceneSchema);

export type Scene = z.infer<typeof SceneSchema>;