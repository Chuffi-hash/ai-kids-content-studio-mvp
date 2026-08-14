interface StoryFiltersProps {
  audienceFilter: string;
  genreFilter: string;
  visualStyleFilter: string;
  onAudienceChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onVisualStyleChange: (value: string) => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export default function StoryFilters({
  audienceFilter,
  genreFilter,
  visualStyleFilter,
  onAudienceChange,
  onGenreChange,
  onVisualStyleChange,
  onClearFilters,
  hasActiveFilters,
}: StoryFiltersProps) {
  return (
    <div className="story-filters">
      <div className="story-filter-group">
        <label>
          Audience
          <select value={audienceFilter} onChange={(e) => onAudienceChange(e.target.value)}>
            <option value="">All audiences</option>
            <option>Children</option>
            <option>Teen</option>
            <option>Adult</option>
            <option>General</option>
          </select>
        </label>

        <label>
          Genre
          <select value={genreFilter} onChange={(e) => onGenreChange(e.target.value)}>
            <option value="">All genres</option>
            <option>Adventure</option>
            <option>Fantasy</option>
            <option>Sci-Fi</option>
            <option>Mystery</option>
            <option>Romance</option>
            <option>Horror</option>
            <option>Comedy</option>
            <option>Drama</option>
            <option>Educational</option>
          </select>
        </label>

        <label>
          Visual Style
          <select value={visualStyleFilter} onChange={(e) => onVisualStyleChange(e.target.value)}>
            <option value="">All visual styles</option>
            <option>Anime</option>
            <option>Cartoon</option>
            <option>Storybook</option>
            <option>Realistic</option>
            <option>Cinematic</option>
            <option>Watercolor</option>
            <option>Manga</option>
            <option>Comic</option>
            <option>3D</option>
          </select>
        </label>

        {hasActiveFilters && (
          <button className="story-clear-filters" onClick={onClearFilters}>
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
