interface StoryIdeaInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function StoryIdeaInput({
  value,
  onChange,
}: StoryIdeaInputProps) {
  return (
    <div className="story-idea-input">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe the story you want to create..."
        rows={6}
      />
      <p className="hint">
        Write a short concept, character idea, or the world your story takes
        place in.
      </p>
    </div>
  );
}
