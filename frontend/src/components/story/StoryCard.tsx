interface Story {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoryCardProps {
  story: Story;
  onOpen: (storyId: string) => void;
}

export default function StoryCard({ story, onOpen }: StoryCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="story-card">
      <div className="story-card-header">
        <h3>{story.title}</h3>
        <div className="story-card-badges">
          {story.audience && <span className="story-badge">{story.audience}</span>}
          {story.genre && <span className="story-badge">{story.genre}</span>}
          {story.visualStyle && <span className="story-badge story-badge-visual">{story.visualStyle}</span>}
        </div>
      </div>
      <p className="story-card-logline">{story.logline}</p>
      <div className="story-card-footer">
        <span className="story-card-date">{formatDate(story.createdAt)}</span>
        <button className="story-card-open-btn" onClick={() => onOpen(story.storyId)}>
          Open
        </button>
      </div>
    </div>
  );
}
