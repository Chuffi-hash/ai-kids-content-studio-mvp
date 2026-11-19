/**
 * Central Normalized Metadata-Label Registry for Story Script Parsing.
 *
 * Provides deterministic classification of English and Hindi production labels
 * before checking dialogue cues, preventing production instructions, camera directions,
 * captions, continuity rules, and end-screen notes from leaking as characters.
 */

export type MetadataCategory =
  | 'end_screen_text'
  | 'character_consistency'
  | 'visual_style'
  | 'camera_direction'
  | 'scene_notes'
  | 'background_prompt'
  | 'narration'
  | 'effects'
  | 'sound_effects'
  | 'music'
  | 'duration'
  | 'transition'
  | 'caption'
  | 'characters_present'
  | 'character_action'
  | 'speaking_emotion'
  | 'facial_expression'
  | 'dialogue'
  | 'title'
  | 'summary'
  | 'logline'
  | 'lesson'
  | 'location'
  | 'time_of_day'
  | 'weather'
  | 'lighting'
  | 'on_screen_text';

/**
 * Normalizes a raw key or label:
 * - Removes markdown bold/italics (**, *, _, ~)
 * - Removes heading markers (#)
 * - Removes colons, dashes, em-dashes, quotes, parentheses
 * - Lowercases, trims, and collapses multiple whitespace characters.
 */
export function normalizeMetadataKey(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^#+\s*/, '')
    .replace(/[*_~`]/g, '')
    .replace(/[\:—–\-"'“”\(\)]+/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Registry mapping normalized English and Devanagari Hindi labels to canonical categories.
 */
const METADATA_LABEL_DICTIONARY: Record<string, MetadataCategory> = {
  // End Screen & Outro
  'end screen text': 'end_screen_text',
  'end screen': 'end_screen_text',
  'end screen content': 'end_screen_text',
  'end screen caption': 'end_screen_text',
  'closing caption': 'end_screen_text',
  'closing text': 'end_screen_text',
  'outro text': 'end_screen_text',
  'outro': 'end_screen_text',
  'credits': 'end_screen_text',
  'closing card': 'end_screen_text',
  'अंतिम स्क्रीन टेक्स्ट': 'end_screen_text',
  'अंतिम स्क्रीन': 'end_screen_text',
  'समापन स्क्रीन': 'end_screen_text',
  'समापन टेक्स्ट': 'end_screen_text',
  'समापन कैप्शन': 'end_screen_text',
  'क्रेडिट्स': 'end_screen_text',

  // Character Consistency & Continuity
  'character consistency': 'character_consistency',
  'character continuity': 'character_consistency',
  'global continuity': 'character_consistency',
  'continuity': 'character_consistency',
  'visual continuity': 'character_consistency',
  'consistency': 'character_consistency',
  'continuity notes': 'character_consistency',
  'पात्र निरंतरता': 'character_consistency',
  'पात्र विवरण': 'character_consistency',
  'निरंतरता': 'character_consistency',

  // Visual Style & Art Direction
  'visual style': 'visual_style',
  'art style': 'visual_style',
  'art direction': 'visual_style',
  'project look': 'visual_style',
  'animation style': 'visual_style',
  'style': 'visual_style',
  'कला शैली': 'visual_style',
  'दृश्य शैली': 'visual_style',
  'एनीमेशन शैली': 'visual_style',
  'शैली': 'visual_style',

  // Camera Direction & Shot composition
  'camera direction': 'camera_direction',
  'camera movement': 'camera_direction',
  'camera angle': 'camera_direction',
  'camera': 'camera_direction',
  'shot': 'camera_direction',
  'shot type': 'camera_direction',
  'shot instruction': 'camera_direction',
  'perspective': 'camera_direction',
  'angle': 'camera_direction',
  'कैमरा निर्देश': 'camera_direction',
  'कैमरा': 'camera_direction',
  'कैमरा एंगल': 'camera_direction',
  'शॉट': 'camera_direction',

  // Scene Notes & Production instructions
  'scene notes': 'scene_notes',
  'scene note': 'scene_notes',
  'production notes': 'scene_notes',
  'director notes': 'scene_notes',
  'director note': 'scene_notes',
  'notes': 'scene_notes',
  'note': 'scene_notes',
  'दृश्य नोट्स': 'scene_notes',
  'नोट्स': 'scene_notes',
  'नोट': 'scene_notes',
  'टिप्पणी': 'scene_notes',

  // Background Prompt & Setting
  'background prompt': 'background_prompt',
  'background description': 'background_prompt',
  'background': 'background_prompt',
  'visual prompt': 'background_prompt',
  'visual description': 'background_prompt',
  'visual scene prompt': 'background_prompt',
  'scene prompt': 'background_prompt',
  'visual': 'background_prompt',
  'image prompt': 'background_prompt',
  'image': 'background_prompt',
  'setting': 'background_prompt',
  'environment': 'background_prompt',
  'environment description': 'background_prompt',
  'location description': 'background_prompt',
  'पृष्ठभूमि प्रॉम्प्ट': 'background_prompt',
  'पृष्ठभूमि विवरण': 'background_prompt',
  'पृष्ठभूमि': 'background_prompt',
  'दृश्य प्रॉम्प्ट': 'background_prompt',
  'दृश्य विवरण': 'background_prompt',
  'दृश्य': 'background_prompt',
  'स्थान विवरण': 'background_prompt',

  // Location, Time of Day, Weather, Lighting
  'location': 'location',
  'स्थान': 'location',
  'जगह': 'location',
  'लोकेशन': 'location',
  'time of day': 'time_of_day',
  'time': 'time_of_day',
  'समय': 'time_of_day',
  'दिन का समय': 'time_of_day',
  'weather': 'weather',
  'मौसम': 'weather',
  'lighting': 'lighting',
  'प्रकाश': 'lighting',
  'रोशनी': 'lighting',

  // Narration & Voice-Over
  'narration': 'narration',
  'narration script': 'narration',
  'narration text': 'narration',
  'narrator': 'narration',
  'voiceover': 'narration',
  'voice over': 'narration',
  'vo': 'narration',
  'v o': 'narration',
  'सूत्रधार': 'narration',
  'कथावाचक': 'narration',
  'वॉइसओवर': 'narration',
  'वाचन': 'narration',

  // Effects (VFX)
  'effects': 'effects',
  'effect': 'effects',
  'visual effects': 'effects',
  'vfx': 'effects',
  'overlays': 'effects',
  'overlay': 'effects',
  'suggested overlays': 'effects',
  'atmosphere': 'effects',
  'weather effects': 'effects',
  'प्रभाव': 'effects',
  'दृश्य प्रभाव': 'effects',
  'मौसम प्रभाव': 'effects',
  'ओवरले': 'effects',

  // Sound Effects (SFX)
  'sound effects': 'sound_effects',
  'sound effect': 'sound_effects',
  'sfx': 'sound_effects',
  'sound': 'sound_effects',
  'audio effects': 'sound_effects',
  'ध्वनि प्रभाव': 'sound_effects',
  'ध्वनि': 'sound_effects',
  'आवाज': 'sound_effects',

  // Music & BGM
  'music': 'music',
  'bgm': 'music',
  'background music': 'music',
  'soundtrack': 'music',
  'संगीत': 'music',
  'पार्श्व संगीत': 'music',
  'धुन': 'music',

  // Duration
  'duration': 'duration',
  'scene duration': 'duration',
  'target duration': 'duration',
  'length': 'duration',
  'estimated duration': 'duration',
  'अवधि': 'duration',
  'दृश्य अवधि': 'duration',

  // Transitions
  'transition': 'transition',
  'transition out': 'transition',
  'cut to': 'transition',
  'fade to': 'transition',
  'dissolve to': 'transition',
  'परिवर्तन': 'transition',

  // Captions & On-Screen Text
  'caption': 'caption',
  'opening caption': 'caption',
  'on screen text': 'on_screen_text',
  'on-screen text': 'on_screen_text',
  'text overlay': 'on_screen_text',
  'title overlay': 'on_screen_text',
  'subtitles': 'on_screen_text',
  'कैप्शन': 'caption',
  'प्रारंभिक कैप्शन': 'caption',
  'स्क्रीन पर टेक्स्ट': 'on_screen_text',
  'शीर्षक ओवरले': 'on_screen_text',

  // Characters Present / Cast
  'characters present': 'characters_present',
  'characters in scene': 'characters_present',
  'characters': 'characters_present',
  'cast': 'characters_present',
  'present characters': 'characters_present',
  'दृश्य में पात्र': 'characters_present',
  'उपस्थित पात्र': 'characters_present',
  'पात्र': 'characters_present',

  // Character Action
  'character action': 'character_action',
  'character actions': 'character_action',
  'action': 'character_action',
  'actions': 'character_action',
  'pose': 'character_action',
  'poses': 'character_action',
  'क्रिया': 'character_action',
  'अभिनय': 'character_action',
  'हरकत': 'character_action',

  // Speaking Emotion & Facial Expression
  'speaking emotion': 'speaking_emotion',
  'speaking emotions': 'speaking_emotion',
  'speaking style': 'speaking_emotion',
  'tone': 'speaking_emotion',
  'emotion': 'speaking_emotion',
  'emotions': 'speaking_emotion',
  'भाव': 'speaking_emotion',
  'बोलने का भाव': 'speaking_emotion',
  'ध्वनि का भाव': 'speaking_emotion',
  'facial expression': 'facial_expression',
  'facial expressions': 'facial_expression',
  'expression': 'facial_expression',
  'expressions': 'facial_expression',
  'चेहरे के भाव': 'facial_expression',
  'भाव भंगिमा': 'facial_expression',
  'अभिव्यक्ति': 'facial_expression',

  // Story & Scene Overview Metadata
  'title': 'title',
  'story title': 'title',
  'शीर्षक': 'title',
  'summary': 'summary',
  'scene summary': 'summary',
  'सारांश': 'summary',
  'logline': 'logline',
  'synopsis': 'logline',
  'कथासार': 'logline',
  'lesson': 'lesson',
  'moral': 'lesson',
  'शिक्षा': 'lesson',
  'सीख': 'lesson',

  // Dialogue
  'dialogue': 'dialogue',
  'speech': 'dialogue',
  'संवाद': 'dialogue',
  'बातचीत': 'dialogue',
  'लाइन': 'dialogue',
};

/**
 * Looks up the canonical metadata category for a raw label string.
 */
export function lookupMetadataCategory(raw: string): MetadataCategory | null {
  const norm = normalizeMetadataKey(raw);
  if (!norm) return null;

  // 1. Direct exact lookup
  if (METADATA_LABEL_DICTIONARY[norm]) {
    return METADATA_LABEL_DICTIONARY[norm];
  }

  // 2. Prefix/suffix or substring matching for multi-word labels
  for (const [key, category] of Object.entries(METADATA_LABEL_DICTIONARY)) {
    if (norm === key) return category;
    // Word boundary match: e.g. "Scene Notes (Director)" -> "scene notes"
    if (norm.startsWith(key + ' ') || norm.endsWith(' ' + key)) {
      return category;
    }
  }

  return null;
}

/**
 * Returns true if the label is a recognized production metadata label.
 */
export function isProductionMetadataLabel(raw: string): boolean {
  return lookupMetadataCategory(raw) !== null;
}

/**
 * Returns true if the label is a non-character production metadata label
 * that must NEVER be interpreted as a character or dialogue speaker.
 */
export function isNonCharacterProductionLabel(raw: string): boolean {
  const category = lookupMetadataCategory(raw);
  if (!category) return false;
  // None of these categories are characters!
  return category !== 'dialogue';
}

/**
 * Checks whether a label line appears to be an unrecognized production instruction or note
 * rather than a character name (e.g. ends in "Text", "Notes", "Instruction", "Caption", etc.)
 */
export function looksLikeProductionInstruction(raw: string): boolean {
  const norm = normalizeMetadataKey(raw);
  if (!norm) return false;

  const metadataWords = [
    'text',
    'notes',
    'note',
    'caption',
    'instruction',
    'instructions',
    'direction',
    'directions',
    'prompt',
    'prompts',
    'consistency',
    'continuity',
    'style',
    'effects',
    'effect',
    'audio',
    'sound',
    'music',
    'lighting',
    'camera',
    'duration',
    'weather',
    'setting',
    'background',
    'narration',
    'summary',
    'टेक्स्ट',
    'नोट्स',
    'कैप्शन',
    'निर्देश',
    'प्रॉम्प्ट',
    'निरंतरता',
    'प्रभाव',
    'संगीत',
  ];

  return metadataWords.some((w) => norm === w || norm.endsWith(' ' + w) || norm.startsWith(w + ' '));
}
