interface StoryGeneratorFormProps {
  topic: string;
  ageGroup: string;
  audience: string;
  genre: string;
  visualStyle: string;
  lesson: string;
  loading: boolean;
  onTopicChange: (value: string) => void;
  onAgeGroupChange: (value: string) => void;
  onAudienceChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onVisualStyleChange: (value: string) => void;
  onLessonChange: (value: string) => void;
  onGenerate: () => void;
}

export default function StoryGeneratorForm({
  topic,
  ageGroup,
  audience,
  genre,
  visualStyle,
  lesson,
  loading,
  onTopicChange,
  onAgeGroupChange,
  onAudienceChange,
  onGenreChange,
  onVisualStyleChange,
  onLessonChange,
  onGenerate,
}: StoryGeneratorFormProps) {
  return (
    <div className="story-creation-panel">
      <div className="story-creation-intro">
        <h2>Create Story</h2>
        <p className="muted">Create an original story and turn it into scenes, visuals and production assets.</p>
      </div>

      <div className="story-settings-section">
        <h3>Story settings</h3>
        <div className="story-settings-grid">
          <div className="story-setting-group">
            <label>
              Audience
              <select value={audience} onChange={(e) => onAudienceChange(e.target.value)}>
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
              <select value={visualStyle} onChange={(e) => onVisualStyleChange(e.target.value)}>
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
        </div>
      </div>

      <div className="story-content-section">
        <h3>Story idea</h3>
        <label>
          <textarea
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="Describe your story idea, main theme, or concept..."
            rows={4}
          />
        </label>
      </div>

      <div className="story-lesson-section">
        <h3>Optional lesson / purpose</h3>
        <label>
          <textarea
            value={lesson}
            onChange={(e) => onLessonChange(e.target.value)}
            placeholder="What lesson or message should this story convey? (optional)"
            rows={3}
          />
        </label>
      </div>

      <button className="primary story-generate-btn" onClick={onGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Story'}
      </button>
    </div>
  );
}
