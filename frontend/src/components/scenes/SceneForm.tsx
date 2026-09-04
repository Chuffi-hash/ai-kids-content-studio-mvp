import { useState } from 'react';
import { Scene } from '../../services/scene.service';

interface SceneFormProps {
  scene?: Scene | null;
  onSubmit: (data: {
    title?: string;
    narration?: string;
    number?: number;
  }) => void;
  onCancel: () => void;
}

export default function SceneForm({ scene, onSubmit, onCancel }: SceneFormProps) {
  const [title, setTitle] = useState(scene?.title || '');
  const [narration, setNarration] = useState(scene?.narration || '');
  const [number, setNumber] = useState(scene?.number || 0);
  const [errors, setErrors] = useState<{
    title?: string;
    narration?: string;
  }>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const newErrors: {
      title?: string;
      narration?: string;
    } = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required.';
    }
    if (!narration.trim()) {
      newErrors.narration = 'Narration is required.';
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      return;
    }

    onSubmit({
      title,
      narration,
      number,
    });
  }

  return (
    <div className="scene-form">
      <div className="scene-form-header">
        <h2>{scene ? 'Edit Scene' : 'Add Scene'}</h2>
        <button
          className="scene-form-close"
          onClick={onCancel}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="scene-form-layout">
        <div className="scene-form-section">
          <h3>Scene Details</h3>
          <div className="form-stack">
            <label>
              Scene Number
              <input
                type="number"
                value={number}
                onChange={(e) => setNumber(parseInt(e.target.value) || 0)}
                min="1"
                disabled={!!scene}
              />
            </label>

            <label>
              Title *
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrors((prev) => ({ ...prev, title: undefined }));
                }}
                placeholder="e.g., The Adventure Begins"
                required
              />
              {errors.title && <div className="field-error">{errors.title}</div>}
            </label>

            <label>
              Narration *
              <textarea
                value={narration}
                onChange={(e) => {
                  setNarration(e.target.value);
                  setErrors((prev) => ({ ...prev, narration: undefined }));
                }}
                placeholder="Describe what happens in this scene..."
                rows={6}
                required
              />
              {errors.narration && <div className="field-error">{errors.narration}</div>}
            </label>
          </div>
        </div>

        <div className="scene-form-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {scene ? 'Update Scene' : 'Add Scene'}
          </button>
        </div>
      </form>
    </div>
  );
}
