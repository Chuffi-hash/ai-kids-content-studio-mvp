export interface SceneInput {
  description: string;
  title?: string;
  narration?: string;
}

export interface CharacterInput {
  name: string;
  species: string;
  personality: string;
  description: string;
}

export function buildSceneImagePrompt(
  scene: SceneInput,
  characters?: CharacterInput[]
): string {
  const baseStyle = [
    "Polished 3D animated children's storybook illustration for ages 4–7",
    "bright cheerful daytime lighting, warm pastel colours, crisp clean shapes, expressive friendly faces",
    "clear focal point, uncluttered composition, cinematic 16:9 frame, high detail",
    "safe and joyful mood, no text, no watermark",
    "avoid darkness, gloomy forests, blur, realistic photography, distorted anatomy, duplicate characters",
  ].join(", ");

  // Build character descriptions if provided
  let characterDescriptions = "";
  if (characters && characters.length > 0) {
    const mentionedCharacters = characters.filter((character) =>
      scene.description.toLowerCase().includes(character.name.toLowerCase()),
    );
    const sceneCharacters = mentionedCharacters.length > 0 ? mentionedCharacters : characters;
    characterDescriptions = sceneCharacters
      .map((character) => `${character.name}: ${character.species}; ${character.description}`)
      .join(". ");
  }

  // Combine all parts
  const parts = [
    baseStyle,
    `Scene action: ${scene.description}`,
    characterDescriptions && `Use only these character designs: ${characterDescriptions}`,
    "Show each named character once, fully visible and correctly proportioned.",
  ].filter(Boolean);

  return parts.join('. ');
}
