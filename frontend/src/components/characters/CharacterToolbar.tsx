interface CharacterToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export default function CharacterToolbar({ searchQuery, onSearchChange }: CharacterToolbarProps) {
  return (
    <div className="character-library-toolbar">
      <input
        type="text"
        className="character-search"
        placeholder="Search characters..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  );
}
