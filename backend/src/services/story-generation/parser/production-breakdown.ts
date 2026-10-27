/**
 * Production Breakdown & Deterministic Element Extractor.
 *
 * Attribution:
 * - Element categories (cast, locations, props, vfx, lighting, sound, camera shots) and
 *   deterministic word list scanning adapted under Apache 2.0 License from ScriptBreak
 *   (Copyright (c) 2024 Sam Wasserman / Wasserman Productions).
 * - Tailored for AI Kids Content Studio with automated overlay mapping, Devanagari Hindi
 *   preservation, and animated rig element separation.
 */

import { ProductionBreakdown } from './types.js';

// Deterministic vocabulary dictionaries for production breakdown
const PROP_KEYWORDS: Record<string, string[]> = {
  umbrella: ['umbrella', 'छाता', 'parasol'],
  seed: ['seed', 'seeds', 'बीज', 'sprout'],
  flower: ['flower', 'flowers', 'फूल', 'blossom', 'rose', 'sunflower'],
  telescope: ['telescope', 'दूरबीन'],
  book: ['book', 'storybook', 'किताब', 'scroll'],
  ball: ['ball', 'गेंद'],
  map: ['map', 'नक्शा'],
  lantern: ['lantern', 'lamp', 'लालटेन', 'दीया'],
  clock: ['clock', 'घड़ी'],
  basket: ['basket', 'टोकरी'],
  boat: ['boat', 'नाव', 'raft'],
  kite: ['kite', 'पतंग'],
  apple: ['apple', 'fruit', 'सेब', 'फल'],
};

const OVERLAY_TYPE_MAPPINGS: Record<string, { label: string; color: string; keywords: string[] }> = {
  sunshine_rays: {
    label: 'Sunshine Rays',
    color: '#fef08a',
    keywords: [
      'sunshine', 'sunshine_rays', 'sunlight', 'sun', 'rays', 'beam', 'sunbeams',
      'golden sun', 'धूप', 'सूरज की किरणें', 'सुनहरी किरणें', 'sunny', 'bright sun'
    ],
  },
  heat_shimmer: {
    label: 'Heat Shimmer',
    color: '#fde047',
    keywords: ['heat_shimmer', 'heat shimmer', 'heat', 'shimmer', 'haze', 'गर्म', 'गर्मी', 'तपन', 'summer heat'],
  },
  rain: {
    label: 'Rain',
    color: '#38bdf8',
    keywords: ['rain', 'monsoon', 'rainfall', 'drizzle', 'shower', 'बारिश', 'वर्षा', 'झमाझम', 'बूंदें', 'water drops'],
  },
  moving_clouds: {
    label: 'Moving Clouds',
    color: '#e2e8f0',
    keywords: ['moving_clouds', 'clouds', 'cloudy', 'rolling clouds', 'बादल', 'काले बादल', 'overcast'],
  },
  water_splashes: {
    label: 'Water Splashes',
    color: '#7dd3fc',
    keywords: ['water_splashes', 'splash', 'splashes', 'spray', 'river', 'झरना', 'नदी', 'छींटे'],
  },
  snowfall: {
    label: 'Snowfall',
    color: '#f8fafc',
    keywords: ['snowfall', 'snow', 'snowing', 'snowflake', 'बर्फ', 'बर्फबारी', 'शीत', 'snowy'],
  },
  fog_mist: {
    label: 'Fog & Mist',
    color: '#f1f5f9',
    keywords: ['fog_mist', 'fog', 'mist', 'misty', 'haze', 'कोहरा', 'धुंध'],
  },
  falling_leaves: {
    label: 'Falling Leaves',
    color: '#f97316',
    keywords: ['falling_leaves', 'autumn leaves', 'leaves', 'पत्ते', 'पतझड़', 'गिरते पत्ते', 'foliage'],
  },
  flying_birds: {
    label: 'Flying Birds',
    color: '#334155',
    keywords: ['flying_birds', 'birds', 'flock', 'flying birds', 'पक्षी', 'चिड़िया', 'sparrow'],
  },
  butterflies: {
    label: 'Butterflies',
    color: '#f43f5e',
    keywords: ['butterflies', 'butterfly', 'तितली', 'तितलियां'],
  },
  lightning: {
    label: 'Lightning',
    color: '#fbbf24',
    keywords: ['lightning', 'thunderstorm', 'बिजली', 'कड़क'],
  },
  stars: {
    label: 'Stars',
    color: '#a78bfa',
    keywords: ['stars', 'starry', 'constellation', 'तारे', 'सितारे', 'night sky'],
  },
};

const LIGHTING_KEYWORDS: Record<string, string[]> = {
  DAY: ['day', 'morning', 'afternoon', 'noon', 'दिन', 'सुबह', 'दोपहर', 'sunlit'],
  NIGHT: ['night', 'midnight', 'moonlit', 'रात', 'अंधेरा', 'dark'],
  GOLDEN_HOUR: ['golden hour', 'sunset', 'sundown', 'dusk', 'शाम', 'गोधूलि', 'सुनहरी'],
  SUNRISE: ['sunrise', 'dawn', 'daybreak', 'भोर', 'सूर्योदय'],
  OVERCAST: ['overcast', 'gloomy', 'monsoon sky', 'बादल छाए'],
};

const SOUND_KEYWORDS: Record<string, string[]> = {
  thunder: ['thunder', 'गरज', 'गडगडाहट'],
  wind_howling: ['wind', 'breeze', 'हवा', 'झोंका'],
  birds_chirping: ['chirping', 'singing birds', 'चहचहाहट'],
  water_splash: ['splash', 'stream', 'छपछप'],
};

export class ProductionBreakdownExtractor {
  /**
   * Deterministically analyzes a scene's text, visual prompt, dialogue, and action lines
   * to extract production elements into an editable breakdown.
   */
  public static extractSceneBreakdown(sceneContext: {
    title: string;
    locationText?: string;
    visualPrompt?: string;
    narration?: string;
    dialogueTexts: string[];
    actionTexts: string[];
    explicitEffects?: string[];
    characterNames: string[];
  }): ProductionBreakdown {
    const combinedCorpus = [
      sceneContext.title,
      sceneContext.locationText || '',
      sceneContext.visualPrompt || '',
      sceneContext.narration || '',
      ...sceneContext.dialogueTexts,
      ...sceneContext.actionTexts,
      ...(sceneContext.explicitEffects || []),
    ].join(' ').toLowerCase();

    // 1. Cast
    const cast = Array.from(new Set(sceneContext.characterNames)).filter(Boolean);

    // 2. Locations
    const locations: string[] = [];
    if (sceneContext.locationText && sceneContext.locationText.trim()) {
      locations.push(sceneContext.locationText.trim());
    } else if (sceneContext.title && sceneContext.title.trim()) {
      locations.push(sceneContext.title.trim());
    }

    // 3. Props
    const detectedProps = new Set<string>();
    for (const [propName, terms] of Object.entries(PROP_KEYWORDS)) {
      if (terms.some((term) => combinedCorpus.includes(term.toLowerCase()))) {
        detectedProps.add(propName);
      }
    }

    // 4. VFX / Studio Overlays
    const detectedVfx = new Set<string>();

    // A. Explicitly specified effects take precedence
    if (Array.isArray(sceneContext.explicitEffects)) {
      for (const eff of sceneContext.explicitEffects) {
        const clean = eff.trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (OVERLAY_TYPE_MAPPINGS[clean]) {
          detectedVfx.add(clean);
        }
      }
    }

    // B. Keyword scanning
    for (const [overlayType, config] of Object.entries(OVERLAY_TYPE_MAPPINGS)) {
      if (config.keywords.some((kw) => combinedCorpus.includes(kw.toLowerCase()))) {
        detectedVfx.add(overlayType);
      }
    }

    // 5. Lighting & Time of Day
    let timeOfDay = 'DAY';
    for (const [tod, terms] of Object.entries(LIGHTING_KEYWORDS)) {
      if (terms.some((term) => combinedCorpus.includes(term.toLowerCase()))) {
        timeOfDay = tod;
        break;
      }
    }

    // 6. Sound Effects
    const detectedSounds = new Set<string>();
    for (const [sfx, terms] of Object.entries(SOUND_KEYWORDS)) {
      if (terms.some((term) => combinedCorpus.includes(term.toLowerCase()))) {
        detectedSounds.add(sfx);
      }
    }

    // 7. Starter Shot List Coverage (ScriptBreak-style)
    const shots: ProductionBreakdown['shots'] = [];

    // Shot 1: Establishing Shot
    shots.push({
      num: 1,
      size: 'WIDE',
      move: 'PUSH_IN',
      angle: 'EYE_LEVEL',
      desc: `Establishing ${locations[0] || 'environment'} with open central foreground for animated characters.`,
    });

    // Shot 2: Character / Dialogue Coverage
    if (cast.length > 0) {
      shots.push({
        num: 2,
        size: 'MEDIUM',
        move: 'STATIC',
        angle: 'EYE_LEVEL',
        desc: `Medium composition focusing on ${cast.join(', ')} with expressive gestures and face animation.`,
      });
    }

    return {
      cast,
      locations,
      props: Array.from(detectedProps),
      vfx: Array.from(detectedVfx),
      lighting: {
        timeOfDay,
        description: `${timeOfDay.replace('_', ' ')} natural ambient illumination`,
      },
      sound: Array.from(detectedSounds),
      shots,
    };
  }

  /**
   * Converts detected VFX into full studio DraftOverlayItem records.
   */
  public static mapVfxToStudioOverlays(vfxList: string[]): Array<{ id: string; type: string; label: string; color?: string }> {
    return vfxList
      .map((vfxType) => {
        const cleanType = vfxType.trim().toLowerCase().replace(/[\s-]+/g, '_');
        const config = OVERLAY_TYPE_MAPPINGS[cleanType];
        if (!config) return null;
        return {
          id: `overlay-${cleanType}-${Math.random().toString(36).slice(2, 8)}`,
          type: cleanType,
          label: config.label,
          color: config.color,
        };
      })
      .filter((o): o is NonNullable<typeof o> => Boolean(o));
  }
}
