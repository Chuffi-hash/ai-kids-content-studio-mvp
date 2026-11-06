import { PromptSynthesizer } from './parser/prompt-synthesizer.js';
import {
  LocationPermanentAnchor,
  StoryVisualBible,
} from './visual-bible.types.js';

export class LocationContinuityService {
  /**
   * Generates a stable, canonical location ID across Hindi, English, and mixed-language names.
   */
  public static resolveLocationId(name: string): string {
    return PromptSynthesizer.generateLocationId(name);
  }

  /**
   * Normalizes raw location string or scene title to canonical name.
   */
  public static normalizeLocationName(name: string): string {
    return PromptSynthesizer.normalizeLocationName(name);
  }

  /**
   * Extracts location name from scene title, visual description, or narration if title is generic.
   */
  public static extractLocationName(
    title: string,
    visualDescription?: string,
    narration?: string
  ): string {
    let fromTitle = PromptSynthesizer.normalizeLocationName(title);
    if (fromTitle && !/^scene\s*\d+/i.test(fromTitle) && !/^दृश्य\s*[\d०-९]+/i.test(fromTitle)) {
      const cleaned = fromTitle
        .replace(/^(?:morning|afternoon|evening|night|sunset|sunrise|twilight|dawn|dusk|gentle rain|rain|storm|sunny day)\s+(?:in|at|over|near|around)\s+/i, '')
        .replace(/^(?:सुबह|दोपहर|शाम|रात|सूर्योदय|सूर्यास्त|बारिश|तूफान)\s+(?:में|पर|के पास)\s+/i, '')
        .replace(/\(.*?\)/g, '')
        .trim();
      if (cleaned.length > 2) {
        return cleaned;
      }
      return fromTitle;
    }

    const combined = `${visualDescription || ''} ${narration || ''}`.trim();
    if (!combined) {
      return fromTitle || 'Storybook Setting';
    }

    // Common Hindi location markers
    if (/जंगल|वन|फॉरेस्ट|forest|woods|grove/i.test(combined)) {
      return /जंगल/.test(combined) ? 'जादुई जंगल (Magical Forest)' : 'Magical Forest';
    }
    if (/नदी|झरना|तालाब|river|stream|lake|brook/i.test(combined)) {
      return /नदी/.test(combined) ? 'नदी का किनारा (Riverbank)' : 'Riverbank';
    }
    if (/पहाड़|पर्वत|घाटी|mountain|hills|valley/i.test(combined)) {
      return /पहाड़/.test(combined) ? 'पहाड़ी घाटी (Mountain Valley)' : 'Mountain Valley';
    }
    if (/गांव|नगर|शहर|village|town|cottage|house/i.test(combined)) {
      return /गांव/.test(combined) ? 'कहानी का गांव (Storybook Village)' : 'Storybook Village';
    }
    if (/कक्षा|स्कूल|पाठशाला|school|classroom/i.test(combined)) {
      return /कक्षा|पाठशाला/.test(combined) ? 'रंग-बिरंगी पाठशाला (Storybook Classroom)' : 'Storybook Classroom';
    }
    if (/उद्यान|बगीचा|garden|park|meadow/i.test(combined)) {
      return /बगीचा/.test(combined) ? 'फूलों का बगीचा (Flower Meadow)' : 'Flower Meadow';
    }

    return fromTitle || 'Storybook Stage';
  }

  /**
   * Infers permanent physical environment anchors for a location to guarantee continuity.
   */
  public static inferLocationAnchors(
    locationName: string,
    visualBible?: StoryVisualBible
  ): LocationPermanentAnchor {
    const locId = LocationContinuityService.resolveLocationId(locationName);
    const lower = locationName.toLowerCase();

    let terrainType = "Storybook nature terrain";
    let horizonStructure = "Soft distant rolling hills under open sky";
    let features: string[] = [
      "Curving pathway with natural stone edging",
      "Gentle flowering slope with balanced foliage clusters",
    ];
    let keyLandmarks: string[] = [
      "Ancient curved oak tree with weathered hollow",
      "Moss-covered natural stone marker",
    ];

    if (lower.includes('forest') || lower.includes('जंगल') || lower.includes('वन') || lower.includes('woods')) {
      terrainType = "Mossy forest floor with scattered soft clovers and stepping stones";
      horizonStructure = "Layered emerald canopy with distant misty blue hill silhouettes";
      features = [
        "Curving dirt trail bordered by smooth river pebbles and wild ferns",
        "Trio of tall ancient birch trees with distinctive silver bark on the left border",
        "Low mossy knoll on the right edge with golden trumpet mushrooms",
      ];
      keyLandmarks = [
        "The Great Grandfather Oak with massive twisting roots and amber knothole",
        "A weather-worn stone birdbath near the pathway bend",
      ];
    } else if (lower.includes('river') || lower.includes('नदी') || lower.includes('stream') || lower.includes('lake') || lower.includes('तालाब')) {
      terrainType = "Smooth pebble riverbank and lush green grassy shore";
      horizonStructure = "Gentle weeping willow curtains framing distant mountain crests";
      features = [
        "Sparkling winding river with visible shallow water and rounded river rocks",
        "Arching rustic timber footbridge crossing the stream in the background",
        "Patches of blue forget-me-nots along the shoreline",
      ];
      keyLandmarks = [
        "Flat sunbathing river rock protruding from the clear stream",
        "Carved wooden rowboat moored to a mossy post",
      ];
    } else if (lower.includes('village') || lower.includes('गांव') || lower.includes('town') || lower.includes('cottage')) {
      terrainType = "Warm rounded cobblestone street and tidy stone borders";
      horizonStructure = "Quaint storybook rooftops, smoking stone chimneys, and gentle hills";
      features = [
        "Curved cobblestone lane with colorful flowerboxes and vintage lampposts",
        "Timber-framed cottage with cheerful yellow window shutters",
        "Low stone garden wall with climbing morning glory vines",
      ];
      keyLandmarks = [
        "Village square wooden fountain with carved stone basin",
        "Old clocktower with copper weather vane in the distance",
      ];
    } else if (lower.includes('mountain') || lower.includes('पहाड़') || lower.includes('valley') || lower.includes('घाटी')) {
      terrainType = "Alpine flower meadow on gentle terraced slopes";
      horizonStructure = "Majestic snow-dusted purple peaks under dramatic clear skies";
      features = [
        "Winding mountain trail with weathered wooden guardrails",
        "Lush alpine edelweiss and blue gentian flower clusters",
        "Tiered rock terraces providing clear scenic lookout levels",
      ];
      keyLandmarks = [
        "Grand panoramic lookout plateau with carved timber railing",
        "Twin pine sentinels framing the mountain valley vista",
      ];
    } else if (lower.includes('school') || lower.includes('कक्षा') || lower.includes('classroom')) {
      terrainType = "Polished warm parquet wooden floor with cheerful circular rug";
      horizonStructure = "Large arched storybook windows overlooking a sunny courtyard garden";
      features = [
        "Cheerful alphabet and world map posters on pastel wooden walls",
        "Neat low wooden cubbies with colorful book spines",
        "Sunlit window seat with cozy cushions",
      ];
      keyLandmarks = [
        "Large green chalkboard with playful chalk illustrations",
        "Classroom mascot terrarium on wooden display table",
      ];
    }

    return {
      locationId: locId,
      locationName,
      canonicalDesc: `${locationName}: ${terrainType}. Permanent landmarks: ${keyLandmarks.join(', ')}.`,
      features,
      terrainType,
      horizonStructure,
      keyLandmarks,
    };
  }

  /**
   * Detects Time of Day from scene text, headings, or narration.
   */
  public static detectTimeOfDay(text: string): 'DAWN' | 'MORNING' | 'AFTERNOON' | 'GOLDEN_HOUR' | 'SUNSET' | 'TWILIGHT' | 'NIGHT' {
    if (!text) return 'MORNING';
    const lower = text.toLowerCase();

    if (/रात|night|midnight|starlit|moonlit|moonlight|अंधेरा/i.test(lower)) {
      return 'NIGHT';
    }
    if (/golden hour|sunset|गोल्डन|सूर्यास्त|शाम ढल|dusk/i.test(lower)) {
      return 'GOLDEN_HOUR';
    }
    if (/twilight|संध्या|सांझ/i.test(lower)) {
      return 'TWILIGHT';
    }
    if (/dawn|sunrise|भोर|सूर्योदय|सवेरा/i.test(lower)) {
      return 'DAWN';
    }
    if (/दोपहर|afternoon|midday|noon/i.test(lower)) {
      return 'AFTERNOON';
    }
    if (/morning|सुबह|प्रातः|दिन|day|daylight|sunlit/i.test(lower)) {
      return 'MORNING';
    }
    return 'MORNING';
  }

  /**
   * Detects Weather conditions from scene text.
   */
  public static detectWeather(text: string): 'CLEAR' | 'SUNNY' | 'OVERCAST' | 'RAINY' | 'FOGGY' | 'SNOWY' | 'WINDY' {
    if (!text) return 'CLEAR';
    const lower = text.toLowerCase();

    if (/rain|बारिश|वर्षा|बरसात|shower|drizzle|wet leaves|puddle/i.test(lower)) {
      return 'RAINY';
    }
    if (/fog|धुंध|mist|misty|कोहरा|haze/i.test(lower)) {
      return 'FOGGY';
    }
    if (/snow|बर्फ|बरफ|blizzard|frost|chilly/i.test(lower)) {
      return 'SNOWY';
    }
    if (/wind|हवा|तूफान|breeze|breezy|swaying/i.test(lower)) {
      return 'WINDY';
    }
    if (/cloud|overcast|बादल|घने बादल|gloomy|dark clouds/i.test(lower)) {
      return 'OVERCAST';
    }
    if (/sun|धूप|sunny|bright|खीली धूप/i.test(lower)) {
      return 'SUNNY';
    }
    return 'CLEAR';
  }

  /**
   * Resolves harmonized environmental lighting based on Time of Day and Weather.
   */
  public static resolveLighting(timeOfDay: string, weather: string): string {
    const tod = timeOfDay.toUpperCase();
    const w = weather.toUpperCase();

    if (tod === 'NIGHT') {
      return "Cool deep indigo night illumination, soft silver moonlight casting gentle pale highlights, soft starlight glow";
    }
    if (tod === 'GOLDEN_HOUR' || tod === 'SUNSET') {
      return "Rich warm golden-hour sunlight at a low angle, long luminous amber rays, glowing orange and violet sky rim lighting";
    }
    if (tod === 'DAWN') {
      return "Fresh pastel peach and soft pink morning dawn light, gentle dewy specular highlights, soft awakening glow";
    }
    if (w === 'RAINY') {
      return "Gentle diffuse overcast lighting with soft luminous rain reflections, wet glistening leaf textures, muted atmospheric tones";
    }
    if (w === 'FOGGY') {
      return "Soft ethereal diffused light through atmospheric mist, mysterious depth layers, gentle muted pastel shadows";
    }
    if (w === 'OVERCAST') {
      return "Soft, shadowless diffuse daylight, rich natural foliage saturation, gentle cloud cover bounce";
    }

    return "Bright cheerful warm storybook daylight, gentle dappled sunbeams filtering through leaves, sparkling ambient highlights";
  }

  /**
   * Normalizes camera perspective to consistent, descriptive phrasing.
   */
  public static normalizeCameraPerspective(cameraDirection?: string): string {
    if (!cameraDirection) return "Eye-level wide establishing shot";
    const lower = cameraDirection.toLowerCase();

    if (lower.includes("bird") || (lower.includes("high") && lower.includes("angle"))) {
      return "High-angle bird's-eye perspective looking down across the scenic environment";
    }
    if (lower.includes("low") && lower.includes("angle")) {
      return "Low-angle perspective looking slightly upward, emphasizing towering environmental heights";
    }
    if (lower.includes("close-up") || lower.includes("closeup")) {
      return "Close-up environmental framing highlighting intimate background textures";
    }
    if (lower.includes("medium")) {
      return "Balanced medium environmental shot showing clear mid-range depth";
    }
    if (lower.includes("wide") || lower.includes("establishing")) {
      return "Wide panoramic establishing perspective showcasing the complete scenic horizon";
    }

    return "Eye-level wide perspective with expansive scenic backdrop";
  }

  /**
   * Detects environmental changes from previous scene to current scene (e.g. rain puddles, sunset glow).
   */
  public static detectEnvironmentalChanges(
    currentScene: { timeOfDay?: string; weather?: string; visualDescription?: string },
    prevScene?: { timeOfDay?: string; weather?: string; visualDescription?: string }
  ): string[] {
    const changes: string[] = [];

    if (!prevScene) {
      return ["Initial establishing environmental state"];
    }

    if (prevScene.weather !== currentScene.weather) {
      if (currentScene.weather === 'RAINY') {
        changes.push("Fresh rain droplets glistening on leaves, small clear puddles forming on stone path");
      } else if (prevScene.weather === 'RAINY' && currentScene.weather !== 'RAINY') {
        changes.push("Post-rain atmosphere: wet glistening ground, fresh rain reflections, evaporating light mist");
      } else if (currentScene.weather === 'SNOWY') {
        changes.push("Delicate blanket of white snow resting on tree branches and stone ledges");
      }
    }

    if (prevScene.timeOfDay !== currentScene.timeOfDay) {
      if (currentScene.timeOfDay === 'GOLDEN_HOUR') {
        changes.push("Sun dipping towards the horizon, casting deep warm golden amber rays across the scene");
      } else if (currentScene.timeOfDay === 'NIGHT') {
        changes.push("Twilight fading into deep starlit night, moonlight taking over as the primary light source");
      } else if (currentScene.timeOfDay === 'MORNING' && prevScene.timeOfDay === 'NIGHT') {
        changes.push("First rays of morning light breaking over the horizon, clearing the night shadows");
      }
    }

    return changes.length > 0 ? changes : ["Continuous environmental conditions"];
  }
}
