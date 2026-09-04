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
  canonicalAppearance?: any;
  referenceImageUrl?: string;
}

export function buildSceneImagePrompt(
  scene: SceneInput,
  characters?: CharacterInput[]
): string {
  // Base visual style for children's storybook illustrations
  const visualStyle = [
    "Polished 3D animated children's storybook illustration for ages 4–7",
    "bright cheerful daytime lighting, warm pastel colours, crisp clean shapes, expressive friendly faces",
    "clear focal point, uncluttered composition, cinematic 16:9 frame, high detail",
    "safe and joyful mood, no text, no watermark",
    "avoid darkness, gloomy forests, blur, realistic photography, distorted anatomy, duplicate characters",
  ].join(", ");

  // Build detailed character descriptions
  let characterSection = "";
  if (characters && characters.length > 0) {
    const mentionedCharacters = characters.filter((character) =>
      scene.description.toLowerCase().includes(character.name.toLowerCase()) ||
      (scene.narration && scene.narration.toLowerCase().includes(character.name.toLowerCase()))
    );
    const sceneCharacters = mentionedCharacters.length > 0 ? mentionedCharacters : characters;
    
    characterSection = "CHARACTERS:\n";
    sceneCharacters.forEach((character) => {
      // Use canonical appearance if available, otherwise fall back to description
      const appearance = character.canonicalAppearance 
        ? Object.entries(character.canonicalAppearance)
            .filter(([_, value]) => value && typeof value === 'string')
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ')
        : character.description;
      
      characterSection += `${character.name}:\n`;
      characterSection += `- Species: ${character.species}\n`;
      characterSection += `- Personality: ${character.personality}\n`;
      characterSection += `- Appearance: ${appearance}\n`;
    });
    characterSection += "\n";
  }

  // Scene description and action
  const sceneSection = `SCENE:\n${scene.description}\n`;
  
  // Add narration if available for context
  const narrationSection = scene.narration ? `NARRATION:\n${scene.narration}\n` : "";

  // Environment and atmosphere
  const environmentSection = `ENVIRONMENT:\nBright, cheerful setting appropriate for children's story. Clear visibility, warm atmosphere.\n`;

  // Composition and framing
  const compositionSection = `COMPOSITION:\nCinematic 16:9 wide shot. Show all characters fully visible and correctly proportioned. Clear foreground and background separation.\n`;

  // Lighting
  const lightingSection = `LIGHTING:\nBright, natural daytime lighting. Soft shadows, warm golden hour feel. No harsh contrasts or dark areas.\n`;

  // Mood
  const moodSection = `MOOD:\nJoyful, adventurous, safe, and engaging for young children.\n`;

  // Continuity instruction
  const continuitySection = `CONTINUITY:\nKeep every character's appearance consistent with the provided character descriptions. Do not change character features, clothing, or accessories between scenes.\n`;

  // Combine all sections
  const fullPrompt = [
    `STYLE: ${visualStyle}`,
    characterSection,
    sceneSection,
    narrationSection,
    environmentSection,
    compositionSection,
    lightingSection,
    moodSection,
    continuitySection,
  ].filter(Boolean).join("\n");

  return fullPrompt;
}
