import { StorybookStory } from '../../services/storybook.service';

interface StoryOverviewProps {
  story: StorybookStory;
  onEdit: () => void;
}

export function StoryOverview({ story, onEdit }: StoryOverviewProps) {
  return (
    <div className="story-overview">
      <div className="overview-header">
        <h2>Story Overview</h2>
        <button className="secondary" onClick={onEdit}>
          Edit Story
        </button>
      </div>

      <div className="overview-section">
        <h3>Story Details</h3>
        <div className="overview-grid">
          <div className="overview-field">
            <label>Title</label>
            <p>{story.title}</p>
          </div>
          <div className="overview-field">
            <label>Logline</label>
            <p>{story.logline}</p>
          </div>
        </div>
      </div>

      <div className="overview-section">
        <h3>Generation Settings</h3>
        <div className="overview-grid">
          {story.topic && (
            <div className="overview-field">
              <label>Topic / Story Idea</label>
              <p>{story.topic}</p>
            </div>
          )}
          {story.ageGroup && (
            <div className="overview-field">
              <label>Age Group</label>
              <p>{story.ageGroup}</p>
            </div>
          )}
          {story.audience && (
            <div className="overview-field">
              <label>Audience</label>
              <p>{story.audience}</p>
            </div>
          )}
          {story.genre && (
            <div className="overview-field">
              <label>Genre</label>
              <p>{story.genre}</p>
            </div>
          )}
          {story.visualStyle && (
            <div className="overview-field">
              <label>Visual Style</label>
              <p>{story.visualStyle}</p>
            </div>
          )}
        </div>
      </div>

      <div className="overview-section">
        <h3>Lesson / Purpose</h3>
        <p>{story.lesson}</p>
      </div>

      {story.characters && story.characters.length > 0 && (
        <div className="overview-section">
          <h3>Characters ({story.characters.length})</h3>
          <div className="character-chips">
            {story.characters.map((character) => (
              <div key={character.id} className="character-chip">
                <strong>{character.name}</strong>
                <span className="muted">{character.species}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
