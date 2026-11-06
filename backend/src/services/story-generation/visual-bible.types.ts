/**
 * Story Visual Bible, Location Continuity, and Scene Visual Specification types.
 *
 * Designed for AI Kids Content Studio V2 Scene Background Prompt Generator.
 * Provides a structured, persistent, and reproducible visual identity for stories
 * and scene-specific environment plates while strictly enforcing character exclusion.
 */

export interface ArtDirection {
  style: string;                  // e.g. "Cinematic 3D storybook animation", "Whimsical watercolor"
  renderingTechnique: string;     // e.g. "Soft CGI render with tactile textures and gentle bevels"
  visualQuality: string;          // e.g. "8K masterpiece, ultra-detailed storybook plate"
  levelOfDetail: 'soft' | 'medium' | 'high' | 'intricate';
  colorPalette: string;           // e.g. "Rich natural greens, golden ambers, soft warm teals"
  textures: string;               // e.g. "Wood grain, soft moss, smooth pebbles, brushed cloth"
  lightingStyle: string;          // e.g. "Volumetric warm sunlight, soft ambient rim illumination"
  depthAndPerspective: string;    // e.g. "Deep cinematic layers with soft atmospheric perspective"
  realismOrStylization: string;   // e.g. "Stylized Disney/Pixar animated environment"
  overallTone: string;            // e.g. "Joyful, whimsical, uplifting, and safe for children"
}

export interface WorldIdentity {
  worldDescription: string;       // e.g. "An enchanted lush valley bordered by rolling green hills"
  geography: string;              // e.g. "Dense gentle forest, sparkling clear river, sunlit meadows"
  recurringLocations: string[];   // e.g. ["Sunlit Glade", "Whispering Brook", "Oak Treehouse"]
  recognizableLandmarks: string[];// e.g. ["The Giant Ancient Banyan Tree", "Crystal Stream Bridge"]
  architecture?: string;          // e.g. "Organic tree-integrated cottages, fairy-tale timber structures"
  terrainAndVegetation: string;   // e.g. "Lush clover carpets, wildflower patches, towering oak canopies"
  recurringObjects: string[];     // e.g. ["Wooden signposts", "Stone stepping paths", "Glow-mushrooms"]
  environmentalDesignRules: string[]; // e.g. ["Rounded corners, friendly natural shapes, no sharp/scary elements"]
}

export interface LightingAndColorIdentity {
  dominantColors: string[];       // e.g. ["#2E7D32", "#FFA000", "#81D4FA"]
  secondaryColors: string[];      // e.g. ["#FFF9C4", "#D7CCC8"]
  lightingQuality: string;        // e.g. "Soft diffuse illumination with warm specular highlights"
  contrast: 'low' | 'medium' | 'high';
  warmth: 'warm' | 'neutral' | 'cool';
  shadows: string;                // e.g. "Soft-edged translucent shadows, never pitch black"
  atmosphericDepth: string;       // e.g. "Gentle sunbeams, slight atmospheric haze in distance"
}

export interface CompositionRules {
  defaultCameraPerspective: string; // e.g. "Eye-level wide establishing shot"
  environmentDepth: string;         // e.g. "Three distinct depth planes: framing foreground, staging middleground, horizon background"
  layers: {
    foreground: string;             // e.g. "Framing foliage, low flowers, or pathway entry"
    middleground: string;           // e.g. "Open central stage for animated vector characters"
    background: string;             // e.g. "Canopy foliage, distant rolling mountains, sky"
  };
  characterPlacementZones: ('center' | 'left' | 'right' | 'open')[];
  clearingRules: string;            // e.g. "Keep middleground 40-70% height clear of large obstructions"
  defaultAspectRatio: string;       // e.g. "16:9" | "9:16" | "1:1" | "4:5"
}

export interface ExclusionRules {
  negativePrompt: string;           // Standard negative prompt
  prohibitedElements: string[];     // Array of elements that must NEVER appear
}

export const DEFAULT_EXCLUSION_RULES: ExclusionRules = {
  negativePrompt: 'No humans, people, characters, children, boys, girls, animals, creatures, humanoid figures, robots, faces, silhouettes, reflections of characters, text, writing, words, captions, subtitles, logos, watermarks, UI elements.',
  prohibitedElements: [
    'characters',
    'people',
    'humans',
    'children',
    'animals',
    'creatures',
    'humanoid figures',
    'silhouettes of living beings',
    'faces in objects',
    'text or captions',
    'watermarks or logos',
  ],
};

export interface StoryVisualBible {
  version: number;
  storyId: string;
  storyTitle: string;
  artDirection: ArtDirection;
  worldIdentity: WorldIdentity;
  lightingAndColor: LightingAndColorIdentity;
  compositionRules: CompositionRules;
  exclusionRules: ExclusionRules;
  createdAt: string;
  updatedAt: string;
}

export interface LocationPermanentAnchor {
  locationId: string;
  locationName: string;
  canonicalDesc: string;
  features: string[];             // e.g. ["Three distinct winding birch trees", "Curved cobblestone bridge"]
  terrainType: string;            // e.g. "Riverbank", "Forest floor", "City square"
  horizonStructure: string;       // e.g. "Distant purple misty mountains"
  keyLandmarks: string[];         // e.g. ["Weathered mossy sundial", "Old stone archway"]
}

export interface SceneVisualSpecification {
  storyId: string;
  sceneId: string;
  sceneNumber: number;
  sceneTitle: string;
  sceneSummary: string;
  visualDescription: string;
  
  // Location & Continuity
  locationId: string;
  locationName: string;
  locationIdentity: string;
  permanentAnchors: string[];
  
  // Dynamic Scene Attributes
  timeOfDay: 'DAWN' | 'MORNING' | 'AFTERNOON' | 'GOLDEN_HOUR' | 'SUNSET' | 'TWILIGHT' | 'NIGHT' | string;
  weather: 'CLEAR' | 'SUNNY' | 'OVERCAST' | 'RAINY' | 'FOGGY' | 'SNOWY' | 'WINDY' | string;
  season?: 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | string;
  mood: string;
  lighting: string;
  cameraPerspective: string;
  
  // Composition & Layering
  composition: {
    foreground: string;
    middleground: string;
    background: string;
    characterPlacementZone: 'center' | 'left' | 'right' | 'open';
    clearingDescription: string;
  };
  
  environmentalObjects: string[];
  environmentalChanges: string[];
  exclusionRules: string[];
  aspectRatio: string;
  continuityInstructions: string[];
}

export interface PromptHistoryEntry {
  id: string;
  version: number;
  prompt: string;
  cameraPerspective: string;
  aspectRatio: string;
  locationId?: string;
  visualBibleVersion?: number;
  isManualEdit: boolean;
  source: 'google_flow_manual' | 'ai_generated' | 'template' | string;
  createdAt: string;
  specification?: SceneVisualSpecification;
}

