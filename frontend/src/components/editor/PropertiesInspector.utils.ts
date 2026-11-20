export type InspectorSection =
  | 'overview'
  | 'shots'
  | 'timing'
  | 'narration'
  | 'background'
  | 'characters'
  | 'dialogue'
  | 'overlays'
  | 'operations';

export function normalizeInspectorSection(tab?: string): InspectorSection {
  if (!tab || tab === 'scene' || tab === 'scene_settings' || tab === 'overview') return 'overview';
  if (tab === 'shots' || tab === 'shot_planning' || tab === 'cinematic_shots' || tab === 'director') return 'shots';
  if (tab === 'animation' || tab === 'rig' || tab === 'characters') return 'characters';
  if (tab === 'timing') return 'timing';
  if (tab === 'narration') return 'narration';
  if (tab === 'background') return 'background';
  if (tab === 'dialogue') return 'dialogue';
  if (tab === 'overlays') return 'overlays';
  if (tab === 'operations') return 'operations';
  return 'overview';
}
