export type VideoTemplateId = 'kids-story' | 'moral-story' | 'educational' | 'nursery-learning' | 'intro-outro';
export type SubtitleTheme = 'classic' | 'karaoke' | 'speech-bubble' | 'minimal';
export type TemplateDecorStyle = 'playful' | 'moral' | 'educational' | 'nursery' | 'cinematic';

export interface VideoTemplate {
  id: VideoTemplateId;
  label: string;
  description: string;
  subtitleTheme: SubtitleTheme;
  titleColor: string;
  titleBadgeBg?: string;
  titleBadgeBorder?: string;
  decorStyle: TemplateDecorStyle;
  tagLabel?: string;
  showIntroCard?: boolean;
  showOutroCard?: boolean;
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  {
    id: 'kids-story',
    label: 'Kids Story',
    description: 'Warm story captions, cheerful badges and playful speaker bubbles',
    subtitleTheme: 'speech-bubble',
    titleColor: '#fff7d6',
    titleBadgeBg: 'rgba(245, 158, 11, 0.28)',
    titleBadgeBorder: 'rgba(251, 191, 36, 0.65)',
    decorStyle: 'playful',
    tagLabel: 'Storybook Adventure',
  },
  {
    id: 'moral-story',
    label: 'Moral Story',
    description: 'Classic gold/amber typography with moral lesson highlights',
    subtitleTheme: 'classic',
    titleColor: '#fef3c7',
    titleBadgeBg: 'rgba(217, 119, 6, 0.25)',
    titleBadgeBorder: 'rgba(245, 158, 11, 0.55)',
    decorStyle: 'moral',
    tagLabel: 'Moral of the Story',
  },
  {
    id: 'educational',
    label: 'Educational Explainer',
    description: 'Karaoke word highlighting, discovery badges and high readability',
    subtitleTheme: 'karaoke',
    titleColor: '#dbeafe',
    titleBadgeBg: 'rgba(2, 132, 199, 0.28)',
    titleBadgeBorder: 'rgba(56, 189, 248, 0.6)',
    decorStyle: 'educational',
    tagLabel: 'Fun Learning & Facts',
  },
  {
    id: 'nursery-learning',
    label: 'Nursery Learning',
    description: 'Chunky high-contrast playful text for early childhood discovery',
    subtitleTheme: 'minimal',
    titleColor: '#f0fdf4',
    titleBadgeBg: 'rgba(34, 197, 94, 0.28)',
    titleBadgeBorder: 'rgba(74, 222, 128, 0.6)',
    decorStyle: 'nursery',
    tagLabel: 'Early Learners',
  },
  {
    id: 'intro-outro',
    label: 'Intro / Outro',
    description: 'Cinematic title opening card and closing outro sequence',
    subtitleTheme: 'classic',
    titleColor: '#ffffff',
    titleBadgeBg: 'rgba(15, 23, 42, 0.75)',
    titleBadgeBorder: 'rgba(255, 255, 255, 0.3)',
    decorStyle: 'cinematic',
    tagLabel: 'Studio Presentation',
    showIntroCard: true,
    showOutroCard: true,
  },
];

export function getVideoTemplate(id?: string): VideoTemplate {
  return VIDEO_TEMPLATES.find((template) => template.id === id) || VIDEO_TEMPLATES[0];
}
