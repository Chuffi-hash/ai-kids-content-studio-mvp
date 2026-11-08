export type VideoTemplateId = 'kids-story' | 'moral-story' | 'educational' | 'nursery-learning' | 'intro-outro';
export type SubtitleTheme = 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';

export interface VideoTemplate {
  id: VideoTemplateId;
  label: string;
  description: string;
  subtitleTheme: SubtitleTheme;
  titleColor: string;
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  { id: 'kids-story', label: 'Kids Story', description: 'Warm story captions and playful speaker bubbles', subtitleTheme: 'speech-bubble', titleColor: '#fff7d6' },
  { id: 'moral-story', label: 'Moral Story', description: 'Readable classic captions for narrated stories', subtitleTheme: 'classic', titleColor: '#fef3c7' },
  { id: 'educational', label: 'Educational Explainer', description: 'Karaoke-style word emphasis for learning content', subtitleTheme: 'karaoke', titleColor: '#dbeafe' },
  { id: 'nursery-learning', label: 'Nursery Learning', description: 'Minimal, high-contrast captions for early learning', subtitleTheme: 'minimal', titleColor: '#f0fdf4' },
  { id: 'intro-outro', label: 'Intro / Outro', description: 'Clean title-led opening and closing scenes', subtitleTheme: 'classic', titleColor: '#ffffff' },
];

export function getVideoTemplate(id?: string): VideoTemplate {
  return VIDEO_TEMPLATES.find((template) => template.id === id) || VIDEO_TEMPLATES[0];
}
