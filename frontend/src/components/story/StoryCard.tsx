import React from 'react';
import { DeleteButton } from '../common/DeleteButton';
import { BookOpenIcon, ArrowRightIcon } from '../common/Icons';

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
  onDelete?: (storyId: string, title: string) => void;
}

export default function StoryCard({ story, onOpen, onDelete }: StoryCardProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Only open if the user didn't click inside an interactive element
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a')) {
      return;
    }
    onOpen(story.storyId);
  };

  return (
    <div className="story-card" onClick={handleCardClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(story.storyId)}>
      <div className="story-card-header">
        <h3 className="story-card-title">{story.title}</h3>
        <div className="story-card-badges">
          {story.audience && <span className="story-badge story-badge-audience">{story.audience}</span>}
          {story.genre && <span className="story-badge story-badge-genre">{story.genre}</span>}
          {story.visualStyle && <span className="story-badge story-badge-visual">{story.visualStyle}</span>}
        </div>
      </div>

      <p className="story-card-logline" title={story.logline}>
        {story.logline}
      </p>

      <div className="story-card-footer">
        <span className="story-card-date">{formatDate(story.createdAt)}</span>
        <div className="story-card-actions">
          {onDelete && (
            <DeleteButton
              onClick={() => onDelete(story.storyId, story.title)}
              title={`Delete "${story.title}"`}
              ariaLabel={`Delete story ${story.title}`}
              size="sm"
            />
          )}
          <button
            type="button"
            className="story-card-open-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(story.storyId);
            }}
            title={`Open editor for "${story.title}"`}
          >
            <span>Open</span>
            <ArrowRightIcon size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
