import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import StoryCard from "../components/story/StoryCard";
import { getAllStories, deleteStory, Story } from "../services/story.service";
import { ConfirmModal } from "../components/common/ConfirmModal";
import { SearchIcon, CloseIcon, SparklesIcon, BookOpenIcon } from "../components/common/Icons";
import "../components/story/stories-library.css";

export default function StoriesPage() {
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [visualStyleFilter, setVisualStyleFilter] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ storyId: string; title: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    loadStories();
  }, []);

  async function loadStories() {
    try {
      setLoading(true);
      const data = await getAllStories();
      setStories(data);
    } catch (error) {
      console.error("Failed to load stories:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenStory(storyId: string) {
    navigate(`/stories/${storyId}`);
  }

  function handleDeleteStory(storyId: string, title: string) {
    setDeleteConfirm({ storyId, title });
  }

  async function confirmDeleteStory() {
    if (!deleteConfirm) return;

    try {
      setApiError(null);
      await deleteStory(deleteConfirm.storyId);
      setDeleteConfirm(null);
      setStories((prev) => prev.filter((s) => s.storyId !== deleteConfirm.storyId));
    } catch (error) {
      console.error("Failed to delete story:", error);
      setApiError("Failed to delete story. Please try again.");
    }
  }

  function handleClearFilters() {
    setAudienceFilter("");
    setGenreFilter("");
    setVisualStyleFilter("");
    setSearchQuery("");
  }

  const hasActiveFilters = Boolean(
    searchQuery || audienceFilter || genreFilter || visualStyleFilter,
  );

  const filteredStories = stories.filter((story) => {
    const matchesSearch =
      story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.logline.toLowerCase().includes(searchQuery.toLowerCase()) ||
      story.lesson.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAudience =
      !audienceFilter ||
      story.audience?.toLowerCase() === audienceFilter.toLowerCase();

    const matchesGenre =
      !genreFilter || story.genre?.toLowerCase() === genreFilter.toLowerCase();

    const matchesVisualStyle =
      !visualStyleFilter ||
      story.visualStyle?.toLowerCase() === visualStyleFilter.toLowerCase();

    return (
      matchesSearch && matchesAudience && matchesGenre && matchesVisualStyle
    );
  });

  return (
    <div className="stories-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1>Stories</h1>
          <p className="muted">Your generated stories</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/?mode=ai')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
            }}
          >
            <SparklesIcon size={16} />
            <span>Create Story with AI</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/?mode=import')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              fontWeight: 600,
              fontSize: '13px',
              borderRadius: '8px',
            }}
          >
            <BookOpenIcon size={16} />
            <span>Import Existing Script</span>
          </button>
        </div>
      </div>

      {apiError && (
        <div className="api-error">
          <span>{apiError}</span>
          <button onClick={() => setApiError(null)} className="error-close" aria-label="Dismiss error">
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      <div className="stories-toolbar">
        <div className="toolbar-search">
          <SearchIcon className="search-icon" size={15} />
          <input
            type="text"
            placeholder="Search stories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="toolbar-select"
          value={audienceFilter}
          onChange={(e) => setAudienceFilter(e.target.value)}
          aria-label="Filter by audience"
        >
          <option value="">All audiences</option>
          <option>Children</option>
          <option>Teen</option>
          <option>Adult</option>
          <option>General</option>
        </select>

        <select
          className="toolbar-select"
          value={genreFilter}
          onChange={(e) => setGenreFilter(e.target.value)}
          aria-label="Filter by genre"
        >
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

        <select
          className="toolbar-select"
          value={visualStyleFilter}
          onChange={(e) => setVisualStyleFilter(e.target.value)}
          aria-label="Filter by visual style"
        >
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

        {hasActiveFilters && (
          <div className="toolbar-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="stories-loading">Loading stories...</div>
      ) : filteredStories.length === 0 ? (
        <div className="stories-empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>No stories created yet</h3>
            <p className="muted" style={{ marginBottom: '28px' }}>
              Choose how you want to start: spark a new idea with AI or import an existing story script from Claude, Gemini, or ChatGPT.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
              <div
                onClick={() => navigate('/?mode=ai')}
                style={{
                  background: 'var(--ed-surface-elevated, #162035)',
                  border: '1px solid var(--ed-border, #1f293d)',
                  borderRadius: '12px',
                  padding: '24px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ed-accent, #8b5cf6)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ed-border, #1f293d)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#c084fc', fontWeight: 600, fontSize: '15px' }}>
                  <SparklesIcon size={18} />
                  <span>Create Story with AI</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--ed-text-muted, #94a3b8)', margin: 0, lineHeight: 1.5 }}>
                  Enter a concept, select characters, and let AI generate a structured storyboard script ready for review.
                </p>
              </div>

              <div
                onClick={() => navigate('/?mode=import')}
                style={{
                  background: 'var(--ed-surface-elevated, #162035)',
                  border: '1px solid var(--ed-border, #1f293d)',
                  borderRadius: '12px',
                  padding: '24px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ed-accent, #8b5cf6)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--ed-border, #1f293d)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#38bdf8', fontWeight: 600, fontSize: '15px' }}>
                  <BookOpenIcon size={18} />
                  <span>Import Existing Script</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--ed-text-muted, #94a3b8)', margin: 0, lineHeight: 1.5 }}>
                  Paste a full screenplay or Markdown script to automatically convert it into editable scenes.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="stories-grid">
          {filteredStories.map((story) => (
            <StoryCard 
              key={story.id} 
              story={story} 
              onOpen={handleOpenStory}
              onDelete={handleDeleteStory}
            />
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title="Delete Story"
        message={`Are you sure you want to delete "${deleteConfirm?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteStory}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
