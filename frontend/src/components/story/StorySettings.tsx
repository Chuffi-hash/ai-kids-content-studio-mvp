import React from 'react';

export interface StorySettingsProps {
  ageGroup?: string;
  durationSeconds?: number;
  language?: string;
  audience?: string;
  genre: string;
  visualStyle: string;
  onAgeGroupChange?: (value: string) => void;
  onDurationChange?: (value: number) => void;
  onLanguageChange?: (value: string) => void;
  onAudienceChange?: (value: string) => void;
  onGenreChange: (value: string) => void;
  onVisualStyleChange: (value: string) => void;
}

export default function StorySettings({
  ageGroup = '4-7 years',
  durationSeconds = 60,
  language = 'Hindi',
  audience,
  genre,
  visualStyle,
  onAgeGroupChange,
  onDurationChange,
  onLanguageChange,
  onAudienceChange,
  onGenreChange,
  onVisualStyleChange,
}: StorySettingsProps) {
  const currentAge = ageGroup || audience || '4-7 years';

  const handleAgeChange = (val: string) => {
    if (onAgeGroupChange) onAgeGroupChange(val);
    if (onAudienceChange) onAudienceChange(val);
  };

  return (
    <div className="story-settings">
      <label>
        Target Age Group *
        <select
          value={currentAge}
          onChange={(e) => handleAgeChange(e.target.value)}
        >
          <option value="2-4 years">2–4 years (Toddler / Preschool)</option>
          <option value="4-7 years">4–7 years (Early Reader / Kindergarten)</option>
          <option value="8-10 years">8–10 years (Elementary / Middle Grade)</option>
          <option value="10-12 years">10–12 years (Pre-Teen / Advanced)</option>
        </select>
      </label>

      {onDurationChange && (
        <label>
          Story Duration *
          <select
            value={durationSeconds}
            onChange={(e) => onDurationChange(Number(e.target.value))}
          >
            <option value={30}>30s (Quick Teaser ~3 scenes)</option>
            <option value={60}>60s (Standard 1 Min ~4 scenes)</option>
            <option value={120}>120s (Extended 2 Mins ~5 scenes)</option>
            <option value={180}>180s (Full Story 3 Mins ~6 scenes)</option>
          </select>
        </label>
      )}

      {onLanguageChange && (
        <label>
          Language *
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
          >
            <option value="Hindi">Hindi (हिन्दी) [Default]</option>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Japanese">Japanese</option>
          </select>
        </label>
      )}

      <label>
        Genre
        <select value={genre} onChange={(e) => onGenreChange(e.target.value)}>
          <option value="Adventure">Adventure</option>
          <option value="Comedy">Comedy & Silly</option>
          <option value="Fantasy">Fantasy & Magic</option>
          <option value="Mystery">Mystery & Detective</option>
          <option value="Educational">Educational & Science</option>
          <option value="Bedtime">Bedtime & Calm</option>
        </select>
      </label>

      <label>
        Visual Style
        <select
          value={visualStyle}
          onChange={(e) => onVisualStyleChange(e.target.value)}
        >
          <option value="Storybook">Storybook Illustration</option>
          <option value="Cartoon">2D Cartoon Style</option>
          <option value="Anime">Anime & Chibi</option>
          <option value="Watercolor">Watercolor</option>
          <option value="3D">3D Rendered Style</option>
        </select>
      </label>
    </div>
  );
}
