interface StorySettingsProps {
  audience: string;
  genre: string;
  visualStyle: string;
  onAudienceChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onVisualStyleChange: (value: string) => void;
}

export default function StorySettings({
  audience,
  genre,
  visualStyle,
  onAudienceChange,
  onGenreChange,
  onVisualStyleChange,
}: StorySettingsProps) {
  return (
    <div className="story-settings">
      <label>
        Audience
        <select
          value={audience}
          onChange={(e) => onAudienceChange(e.target.value)}
        >
          <option value="">Select audience...</option>
          <option value="Children">Children</option>
          <option value="Teen">Teen</option>
          <option value="Adult">Adult</option>
          <option value="General">General Audience</option>
        </select>
      </label>

      <label>
        Genre
        <select value={genre} onChange={(e) => onGenreChange(e.target.value)}>
          <option value="">Select genre...</option>
          <option>Adventure</option>
          <option>Fantasy</option>
          <option>Sci-Fi</option>
          <option>Mystery</option>
          <option>Romance</option>
          <option>Horror</option>
          <option>Comedy</option>
          <option>Drama</option>
          <option>Educational</option>
          <option>Custom</option>
        </select>
      </label>

      <label>
        Visual Style
        <select
          value={visualStyle}
          onChange={(e) => onVisualStyleChange(e.target.value)}
        >
          <option value="">Select visual style...</option>
          <option>Anime</option>
          <option>Cartoon</option>
          <option>Storybook</option>
          <option>Realistic</option>
          <option>Cinematic</option>
          <option>Watercolor</option>
          <option>Manga</option>
          <option>Comic</option>
          <option>3D</option>
          <option>Custom</option>
        </select>
      </label>
    </div>
  );
}
