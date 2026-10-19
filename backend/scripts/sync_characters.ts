import { prisma } from '../src/services/database/database.service';
import { CHARACTER_PRESETS } from '../src/services/animation/templates/custom-character-rig';
import { randomUUID } from 'crypto';

async function sync() {
  console.log('[Sync] Synchronizing database characters with enhanced presets...');

  // 1. Update Pip (bear)
  const pip = await prisma.character.findFirst({
    where: { name: { equals: 'Pip', mode: 'insensitive' } }
  });
  if (pip) {
    await prisma.character.update({
      where: { id: pip.id },
      data: {
        species: 'Bear',
        personality: 'Cheerful, helpful, and loyal bear friend',
        visualDescription: 'Pip the Bear Cub — cuddly honey-brown teddy bear friend with a cozy vest and friendly smile.',
        canonicalAppearance: {
          ...CHARACTER_PRESETS.bear_cub.appearance,
          voiceConfig: {
            voiceId: 'af_heart',
            speed: 1.0,
            effect: 'normal',
          },
        } as any,
      }
    });
    console.log(`[Sync] Updated Pip (${pip.id})`);
  }

  // 2. Update earth (Planet)
  const earth = await prisma.character.findFirst({
    where: { name: { in: ['earth', 'Earth', 'Terra'], mode: 'insensitive' } }
  });
  if (earth) {
    await prisma.character.update({
      where: { id: earth.id },
      data: {
        name: 'earth',
        species: 'Planet',
        personality: 'Brave, cheerful and adventurous',
        visualDescription: 'Terra the Talking Earth — friendly cartoon planet with vibrant blue oceans, lush green continents, and a radiant atmosphere.',
        canonicalAppearance: {
          ...CHARACTER_PRESETS.earth.appearance,
          voiceConfig: {
            voiceId: 'af_bella',
            speed: 1.0,
            effect: 'normal',
          },
        } as any,
      }
    });
    console.log(`[Sync] Updated earth (${earth.id})`);
  }

  // 3. Update Sammy (Kid Boy)
  const sammy = await prisma.character.findFirst({
    where: { name: { equals: 'Sammy', mode: 'insensitive' } }
  });
  if (sammy) {
    await prisma.character.update({
      where: { id: sammy.id },
      data: {
        species: 'Human',
        personality: 'Cheerful, helpful, loyal',
        visualDescription: 'Sammy the Kid Boy — cheerful and loyal human friend who loves helping others.',
        canonicalAppearance: {
          ...CHARACTER_PRESETS.kid_boy.appearance,
          voiceConfig: {
            voiceId: 'am_adam',
            speed: 1.0,
            effect: 'normal',
          },
        } as any,
      }
    });
    console.log(`[Sync] Updated Sammy (${sammy.id})`);
  }

  // 4. Upsert Sparky (Robot) if not exists
  const sparky = await prisma.character.findFirst({
    where: { name: { equals: 'Sparky', mode: 'insensitive' } }
  });
  if (!sparky) {
    await prisma.character.create({
      data: {
        id: randomUUID(),
        name: 'Sparky',
        species: 'Robot',
        personality: 'Curious, energetic, and inventive robot pal',
        visualDescription: 'Sparky the Robot — metallic slate robot with glowing cyan visor eyes and LED smile.',
        distinctiveFeatures: 'Antenna bulb, chest energy meter, cyan digital expressions',
        canonicalAppearance: {
          ...CHARACTER_PRESETS.robot.appearance,
          voiceConfig: {
            voiceId: 'bm_george',
            speed: 1.0,
            effect: 'robot',
          },
        } as any,
      }
    });
    console.log(`[Sync] Created Sparky the Robot`);
  }

  // 5. Upsert Maya (Kid Girl) if not exists
  const maya = await prisma.character.findFirst({
    where: { name: { equals: 'Maya', mode: 'insensitive' } }
  });
  if (!maya) {
    await prisma.character.create({
      data: {
        id: randomUUID(),
        name: 'Maya',
        species: 'Human',
        personality: 'Inquisitive, cheerful, and creative science-loving girl',
        visualDescription: 'Maya the Kid Girl — bright, cheerful girl with warm brown ponytail and pink hoodie.',
        distinctiveFeatures: 'Ponytail, pink hoodie, starry sneakers',
        canonicalAppearance: {
          ...CHARACTER_PRESETS.kid_girl.appearance,
          voiceConfig: {
            voiceId: 'af_sarah',
            speed: 1.0,
            effect: 'normal',
          },
        } as any,
      }
    });
    console.log(`[Sync] Created Maya`);
  }

  console.log('[Sync] Character synchronization complete!');
}

sync()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

