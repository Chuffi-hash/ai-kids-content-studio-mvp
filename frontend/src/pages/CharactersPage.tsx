import { useState, useEffect } from "react";
import {
  Character,
  getAllCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
} from "../services/character.service";
import CharacterLibraryHeader from "../components/characters/CharacterLibraryHeader";
import CharacterToolbar from "../components/characters/CharacterToolbar";
import CharacterGrid from "../components/characters/CharacterGrid";
import CharacterEmptyState from "../components/characters/CharacterEmptyState";
import CharacterModal from "../components/characters/CharacterModal";
import { ConfirmModal } from "../components/common/ConfirmModal";
import "../components/characters/characters.css";

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [personalityFilter, setPersonalityFilter] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    loadCharacters();
  }, []);

  async function loadCharacters() {
    try {
      setLoading(true);
      const data = await getAllCharacters();
      setCharacters(data);
    } catch (error) {
      console.error("Failed to load characters:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCharacter(data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
  }) {
    try {
      setApiError(null);
      await createCharacter(data);
      setShowModal(false);
      setEditingCharacter(null);
      loadCharacters();
    } catch (error) {
      console.error("Failed to create character:", error);
      setApiError("Failed to create character. Please try again.");
    }
  }

  async function handleEditCharacterSubmit(data: {
    name: string;
    species: string;
    personality: string;
    visualDescription: string;
    distinctiveFeatures?: string;
  }) {
    if (!editingCharacter) return;
    try {
      setApiError(null);
      await updateCharacter(editingCharacter.id, data);
      setShowModal(false);
      setEditingCharacter(null);
      loadCharacters();
    } catch (error) {
      console.error("Failed to update character:", error);
      setApiError("Failed to update character. Please try again.");
    }
  }

  function handleDeleteCharacter(id: string, name: string) {
    setDeleteConfirm({ id, name });
  }

  async function confirmDeleteCharacter() {
    if (!deleteConfirm) return;

    try {
      setApiError(null);
      await deleteCharacter(deleteConfirm.id);
      setDeleteConfirm(null);
      loadCharacters();
    } catch (error) {
      console.error("Failed to delete character:", error);
      setApiError("Failed to delete character. Please try again.");
    }
  }

  function handleEditCharacter(character: Character) {
    setEditingCharacter(character);
    setShowModal(true);
  }

  function handleOpenModal() {
    setEditingCharacter(null);
    setShowModal(true);
  }

  function handleCloseModal() {
    setShowModal(false);
    setEditingCharacter(null);
  }

  function handleClearFilters() {
    setSpeciesFilter("");
    setPersonalityFilter("");
    setSearchQuery("");
  }

  const hasActiveFilters = Boolean(
    searchQuery || speciesFilter || personalityFilter,
  );

  const filteredCharacters = characters.filter((character) => {
    const matchesSearch =
      character.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      character.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
      character.personality.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSpecies =
      !speciesFilter ||
      character.species.toLowerCase().includes(speciesFilter.toLowerCase()) ||
      (speciesFilter === "Other" &&
        ![
          "Human",
          "Animal",
          "Fantasy Creature",
          "Robot",
          "Alien",
          "Plant",
          "Object",
        ].includes(character.species));

    const matchesPersonality =
      !personalityFilter ||
      character.personality
        .toLowerCase()
        .includes(personalityFilter.toLowerCase()) ||
      (personalityFilter === "Other" &&
        ![
          "Brave",
          "Curious",
          "Kind",
          "Wise",
          "Playful",
          "Shy",
          "Adventurous",
          "Smart",
          "Funny",
          "Strong",
          "Gentle",
        ].some((trait) =>
          character.personality.toLowerCase().includes(trait.toLowerCase()),
        ));

    return matchesSearch && matchesSpecies && matchesPersonality;
  });

  return (
    <div className="character-library">
      <CharacterLibraryHeader onCreateCharacter={handleOpenModal} />
      <CharacterToolbar
        searchQuery={searchQuery}
        speciesFilter={speciesFilter}
        personalityFilter={personalityFilter}
        onSearchChange={setSearchQuery}
        onSpeciesChange={setSpeciesFilter}
        onPersonalityChange={setPersonalityFilter}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {apiError && (
        <div className="api-error">
          {apiError}
          <button onClick={() => setApiError(null)} className="error-close">✕</button>
        </div>
      )}

      {loading ? (
        <div className="character-loading">Loading characters...</div>
      ) : filteredCharacters.length === 0 ? (
        <CharacterEmptyState onCreateCharacter={handleOpenModal} />
      ) : (
        <CharacterGrid
          characters={filteredCharacters}
          onEdit={handleEditCharacter}
          onDelete={handleDeleteCharacter}
        />
      )}

      <CharacterModal
        isOpen={showModal}
        character={editingCharacter}
        onSubmit={
          editingCharacter ? handleEditCharacterSubmit : handleCreateCharacter
        }
        onCancel={handleCloseModal}
      />

      <ConfirmModal
        isOpen={deleteConfirm !== null}
        title="Delete Character"
        message={`Are you sure you want to delete "${deleteConfirm?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDeleteCharacter}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
