import { StoryGenerationProvider } from '../story-provider.interface.js';
import { StoryGenerationInput, StructuredStory } from '../story-generation.types.js';

export class DeterministicStoryProvider implements StoryGenerationProvider {
  name = 'deterministic';

  async isAvailable(): Promise<boolean> {
    return true; // Always available offline
  }

  async generateRaw(prompt: string, input: StoryGenerationInput): Promise<string> {
    const story = this.buildStructuredStory(input);
    return JSON.stringify(story, null, 2);
  }

  public buildStructuredStory(input: StoryGenerationInput): StructuredStory {
    const topic = input.topic?.trim() || 'A magical adventure of discovery and friendship';
    const ageGroup = input.ageGroup || '4-7 years';
    const genre = input.genre || 'Adventure';
    const totalDurationSeconds = Math.max(30, Number(input.desiredDurationSeconds) || 60);

    // Determine scene count based on duration or explicit input
    let sceneCount = input.sceneCount;
    if (!sceneCount || sceneCount < 2 || sceneCount > 8) {
      if (totalDurationSeconds <= 30) sceneCount = 3;
      else if (totalDurationSeconds <= 60) sceneCount = 4;
      else if (totalDurationSeconds <= 120) sceneCount = 5;
      else sceneCount = 6;
    }

    const sceneDuration = Math.round(totalDurationSeconds / sceneCount);

    // Extract character cues from topic
    const topicLower = topic.toLowerCase();
    let mainSpecies = 'human';
    let heroName = 'Milo';

    if (topicLower.includes('rabbit') || topicLower.includes('bunny')) {
      mainSpecies = 'rabbit';
      heroName = 'Milo';
    } else if (topicLower.includes('bear')) {
      mainSpecies = 'bear';
      heroName = 'Pip';
    } else if (topicLower.includes('robot')) {
      mainSpecies = 'robot';
      heroName = 'Sparky';
    } else if (topicLower.includes('kid') || topicLower.includes('boy') || topicLower.includes('sammy')) {
      mainSpecies = 'human';
      heroName = 'Sammy';
    } else if (topicLower.includes('girl') || topicLower.includes('maya')) {
      mainSpecies = 'human';
      heroName = 'Maya';
    } else if (topicLower.includes('fox')) {
      mainSpecies = 'fox';
      heroName = 'Finley';
    }

    // Secondary companion
    const companionName = mainSpecies === 'rabbit' ? 'Barnaby' : mainSpecies === 'bear' ? 'Sammy' : 'Pip';
    const companionSpecies = mainSpecies === 'bear' ? 'human' : 'bear';

    // Title & Lesson derivation
    const title =
      input.title?.trim() ||
      (topic.length > 5 && topic.length < 50
        ? topic.replace(/[.]+$/, '')
        : `${heroName} and the ${genre} Wonder`);

    const lesson =
      input.lesson?.trim() ||
      (topicLower.includes('help')
        ? 'Helping others brings joy and makes our community stronger.'
        : topicLower.includes('kind')
        ? 'A little act of kindness can brighten anyone’s day.'
        : topicLower.includes('share')
        ? 'Sharing good things makes friendship grow.'
        : 'Curiosity, courage, and teamwork can solve any puzzle.');

    const logline =
      topic.length > 10 && topic.length < 150
        ? topic
        : `${heroName} embarks on an unforgettable journey to explore a wonder and learn why caring for others matters.`;

    const characters = [
      {
        name: heroName,
        role: 'protagonist',
        species: mainSpecies,
        description: `A brave, cheerful, and curious ${mainSpecies} who loves exploring new wonders.`,
        personality: ['curious', 'brave', 'kind'],
      },
      {
        name: companionName,
        role: 'companion',
        species: companionSpecies,
        description: `A gentle and loyal ${companionSpecies} friend who loves helping others.`,
        personality: ['cheerful', 'helpful', 'loyal'],
      },
    ];

    // Story Beats progression for children:
    // 1. Introduction / Discovery
    // 2. Exploration / Crossing Threshold
    // 3. Challenge / Problem Solving / Teamwork
    // 4. Climax / Reaching the Goal
    // 5. Celebration / Conclusion & Lesson
    const storyBeats = [
      {
        title: 'A Curious Beginning',
        summary: `${heroName} discovers something unexpected and sets out on a new journey.`,
        visualDescription: `A bright, sunlit meadow dotted with sparkling flowers and gentle rolling hills under a soft blue sky.`,
        location: 'Sunny Meadow',
        timeOfDay: 'Morning',
        narration: `One bright and sunny morning, ${heroName} noticed a shimmering path leading toward the mysterious horizon.`,
        dialogue: [
          {
            characterName: heroName,
            text: `Look over there! That path looks so magical. Let's go see where it leads!`,
            emotion: 'excited',
          },
          {
            characterName: companionName,
            text: `I'm right behind you, ${heroName}! Adventure awaits!`,
            emotion: 'happy',
          },
        ],
        characterActions: [
          {
            characterName: heroName,
            action: 'walk',
            pose: 'curious',
            description: `${heroName} steps forward along the flower-lined path.`,
          },
          {
            characterName: companionName,
            action: 'wave',
            pose: 'cheerful',
            description: `${companionName} waves happily to lead the way.`,
          },
        ],
      },
      {
        title: 'The Hidden Path',
        summary: `The two friends walk deeper into the unknown, marveling at the sights.`,
        visualDescription: `A lush enchanted forest with tall whispering trees, colorful glowing lanterns, and soft mossy ground.`,
        location: 'Enchanted Forest',
        timeOfDay: 'Afternoon',
        narration: `Together, they walked into the whispering forest, where every leaf seemed to dance in the gentle breeze.`,
        dialogue: [
          {
            characterName: heroName,
            text: `Everything here feels alive and full of wonder!`,
            emotion: 'curious',
          },
          {
            characterName: companionName,
            text: `Stay close, we don't want to get lost!`,
            emotion: 'calm',
          },
        ],
        characterActions: [
          {
            characterName: heroName,
            action: 'walk',
            pose: 'excited',
            description: `${heroName} walks briskly through the arch of trees.`,
          },
          {
            characterName: companionName,
            action: 'idle',
            pose: 'attentive',
            description: `${companionName} pauses to look around carefully.`,
          },
        ],
      },
      {
        title: 'Lending a Helping Hand',
        summary: `They encounter a little creature in need and work together to help.`,
        visualDescription: `A sparkling stream with smooth stepping stones, gentle waterfalls, and vibrant butterflies fluttering nearby.`,
        location: 'Sparkling Stream',
        timeOfDay: 'Late Afternoon',
        narration: `Along the riverbank, they found a lost friend who needed help finding their way back home.`,
        dialogue: [
          {
            characterName: heroName,
            text: `Don't worry! If we work together, we can cross this stream safely.`,
            emotion: 'kind',
          },
          {
            characterName: companionName,
            text: `Take my hand! Teamwork always makes hard things easy.`,
            emotion: 'encouraging',
          },
        ],
        characterActions: [
          {
            characterName: heroName,
            action: 'jump',
            pose: 'brave',
            description: `${heroName} jumps across the stepping stones to guide the way.`,
          },
          {
            characterName: companionName,
            action: 'wave',
            pose: 'supportive',
            description: `${companionName} waves enthusiastically from the riverbank.`,
          },
        ],
      },
      {
        title: 'The Glowing Wonder',
        summary: `The friends arrive at the heart of their quest and discover the true treasure.`,
        visualDescription: `A breathtaking glowing clearing where magical lanterns shine warmly under a twilight canopy.`,
        location: 'Glowing Garden Heart',
        timeOfDay: 'Sunset',
        narration: `At last, they stood before the glowing garden, realizing that sharing the moment made it even more special.`,
        dialogue: [
          {
            characterName: heroName,
            text: `It's the most beautiful place in the world, and we did it together!`,
            emotion: 'joyful',
          },
          {
            characterName: companionName,
            text: `Best adventure ever! I'm so glad we're friends.`,
            emotion: 'happy',
          },
        ],
        characterActions: [
          {
            characterName: heroName,
            action: 'jump',
            pose: 'celebratory',
            description: `${heroName} jumps with joy under the shimmering sky.`,
          },
          {
            characterName: companionName,
            action: 'wave',
            pose: 'celebratory',
            description: `${companionName} waves both hands in happy triumph.`,
          },
        ],
      },
      {
        title: 'Journey Home with Smiles',
        summary: `Reflecting on the lessons of friendship, kindness, and bravery.`,
        visualDescription: `A warm cozy hilltop overlooking the peaceful kingdom under starry twilight.`,
        location: 'Starry Hilltop',
        timeOfDay: 'Twilight',
        narration: `As the stars began to twinkle, they walked home with full hearts, ready for their next great story.`,
        dialogue: [
          {
            characterName: heroName,
            text: `Today we learned that being kind and helping others is the biggest adventure of all.`,
            emotion: 'peaceful',
          },
        ],
        characterActions: [
          {
            characterName: heroName,
            action: 'wave',
            pose: 'peaceful',
            description: `${heroName} waves goodbye to the magical sunset.`,
          },
        ],
      },
      {
        title: 'A Peaceful Goodnight',
        summary: `The friends rest after an amazing day, filled with wonderful memories.`,
        visualDescription: `A cozy village under a canopy of warm glowing stars and a gentle crescent moon.`,
        location: 'Cozy Village',
        timeOfDay: 'Night',
        narration: `And so, with happy smiles and sleepy eyes, another wonderful chapter came to a peaceful close. Goodnight, brave explorers!`,
        dialogue: [
          {
            characterName: heroName,
            text: `Goodnight, wonderful world! See you tomorrow!`,
            emotion: 'sleepy',
          },
        ],
        characterActions: [
          {
            characterName: heroName,
            action: 'idle',
            pose: 'calm',
            description: `${heroName} stands calmly beneath the gentle moonlight.`,
          },
        ],
      },
    ];

    // Select the requested number of beats
    const selectedBeats = storyBeats.slice(0, sceneCount);

    const scenes = selectedBeats.map((beat, idx) => ({
      sceneNumber: idx + 1,
      title: beat.title,
      summary: beat.summary,
      visualDescription: beat.visualDescription,
      location: beat.location,
      timeOfDay: beat.timeOfDay,
      narration: beat.narration,
      dialogue: beat.dialogue,
      characterActions: beat.characterActions,
      durationSeconds: sceneDuration,
    }));

    return {
      title,
      logline,
      lesson,
      targetAudience: ageGroup,
      genre,
      estimatedDurationSeconds: totalDurationSeconds,
      characters,
      scenes,
    };
  }
}
