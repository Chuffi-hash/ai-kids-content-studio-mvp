import { useState, useEffect } from "react";
import {
  Character,
  getAllCharacters,
  createCharacter,
  updateCharacter,
  deleteCharacter,
  duplicateCharacter,
  generateCharacterReferenceImage,
} from "../services/character.service";
import CharacterLibraryHeader from "../components/characters/CharacterLibraryHeader";
import CharacterToolbar from "../components/characters/CharacterToolbar";
import CharacterGrid from "../components/characters/CharacterGrid";
import CharacterEmptyState from "../components/characters/CharacterEmptyState";
import CharacterModal from "../components/characters/CharacterModal";
import CharacterBuilderModal from "../components/characters/CharacterBuilderModal";
import { ConfirmModal } from "../components/common/ConfirmModal";
import { CloseIcon } from "../components/common/Icons";
import "../components/characters/characters.css";

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBuilderModal, setShowBuilderModal] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(
    null,
  );
  const [builderCharacter, setBuilderCharacter] = useState<Character | null>(
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
    canonicalAppearance?: any;
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
    canonicalAppearance?: any;
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

  async function handleGenerateReference(characterId: string) {
    try {
      setApiError(null);
      await generateCharacterReferenceImage(characterId);
      loadCharacters();
    } catch (error) {
      console.error("Failed to generate reference image:", error);
      setApiError("Failed to generate reference image. Please try again.");
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

  function handleOpenBuilder(character?: Character | null) {
    setBuilderCharacter(character || null);
    setShowBuilderModal(true);
  }

  async function handleSaveFromBuilder(data: any) {
    try {
      setApiError(null);
      if (builderCharacter) {
        await updateCharacter(builderCharacter.id, data);
      } else {
        await createCharacter(data);
      }
      loadCharacters();
    } catch (error: any) {
      console.error("Failed to save character from builder:", error);
      setApiError(error.message || "Failed to save character. A character with this name may already exist.");
    }
  }

  async function handleDuplicateCharacter(id: string) {
    try {
      setApiError(null);
      await duplicateCharacter(id);
      loadCharacters();
    } catch (error) {
      console.error("Failed to duplicate character:", error);
      setApiError("Failed to duplicate character. Please try again.");
    }
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

  // Dynamically extract all unique species from characters plus standard list
  const standardSpeciesList = [
    'Human',
    'Bear',
    'Animal',
    'Fantasy Creature',
    'Robot',
    'Alien',
    'Plant',
    'Object',
  ];
  const dynamicSpeciesOptions = Array.from(
    new Set([
      ...standardSpeciesList,
      ...characters
        .map((c) => c.species?.trim())
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()),
      'Other',
    ])
  );

  // Dynamically extract all individual traits from characters' personalities
  const standardTraitsList = [
    'Brave',
    'Cheerful',
    'Helpful',
    'Loyal',
    'Curious',
    'Kind',
    'Wise',
    'Playful',
    'Shy',
    'Adventurous',
    'Smart',
    'Funny',
    'Strong',
    'Gentle',
    'Creative',
    'Energetic',
  ];
  const dynamicPersonalityOptions = Array.from(
    new Set([
      ...standardTraitsList,
      ...characters
        .flatMap((c) =>
          (c.personality || '')
            .split(/[,;&/]+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 1)
        )
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()),
      'Other',
    ])
  );

  const filteredCharacters = characters.filter((character) => {
    const matchesSearch =
      character.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      character.species.toLowerCase().includes(searchQuery.toLowerCase()) ||
      character.personality.toLowerCase().includes(searchQuery.toLowerCase());

    const cSpecies = (character.species || '').toLowerCase();
    const fSpecies = (speciesFilter || '').toLowerCase();

    let matchesSpecies = true;
    if (speciesFilter) {
      if (fSpecies === 'other') {
        matchesSpecies = !standardSpeciesList.some(
          (s) => s.toLowerCase() === cSpecies
        );
      } else if (fSpecies === 'animal') {
        matchesSpecies =
          cSpecies.includes('animal') ||
          cSpecies.includes('bear') ||
          cSpecies.includes('dog') ||
          cSpecies.includes('cat') ||
          cSpecies.includes('rabbit');
      } else {
        matchesSpecies = cSpecies.includes(fSpecies);
      }
    }

    const cPersonality = (character.personality || '').toLowerCase();
    const fPersonality = (personalityFilter || '').toLowerCase();

    let matchesPersonality = true;
    if (personalityFilter) {
      if (fPersonality === 'other') {
        matchesPersonality = !standardTraitsList.some((trait) =>
          cPersonality.includes(trait.toLowerCase())
        );
      } else {
        matchesPersonality = cPersonality.includes(fPersonality);
      }
    }

    return matchesSearch && matchesSpecies && matchesPersonality;
  });

  return (
    <div className="character-library">
      <CharacterLibraryHeader
        onCreateCharacter={handleOpenModal}
        onOpenBuilder={() => handleOpenBuilder(null)}
      />
      <CharacterToolbar
        searchQuery={searchQuery}
        speciesFilter={speciesFilter}
        personalityFilter={personalityFilter}
        speciesOptions={dynamicSpeciesOptions}
        personalityOptions={dynamicPersonalityOptions}
        onSearchChange={setSearchQuery}
        onSpeciesChange={setSpeciesFilter}
        onPersonalityChange={setPersonalityFilter}
        onClearFilters={handleClearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {apiError && (
        <div className="api-error">
          <span>{apiError}</span>
          <button onClick={() => setApiError(null)} className="error-close" aria-label="Dismiss error">
            <CloseIcon size={12} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="character-loading">Loading characters...</div>
      ) : filteredCharacters.length === 0 ? (
        <CharacterEmptyState onCreateCharacter={() => handleOpenBuilder(null)} />
      ) : (
        <CharacterGrid
          characters={filteredCharacters}
          onEdit={handleEditCharacter}
          onCustomize={(char) => handleOpenBuilder(char)}
          onDuplicate={(char) => handleDuplicateCharacter(char.id)}
          onDelete={handleDeleteCharacter}
          onGenerateReference={handleGenerateReference}
        />
      )}

      <CharacterModal
        isOpen={showModal}
        character={editingCharacter}
        onSubmit={
          editingCharacter ? handleEditCharacterSubmit : handleCreateCharacter
        }
        onCancel={handleCloseModal}
        onOpenBuilder={(char) => {
          handleCloseModal();
          handleOpenBuilder(char);
        }}
      />

      <CharacterBuilderModal
        isOpen={showBuilderModal}
        character={builderCharacter}
        onClose={() => {
          setShowBuilderModal(false);
          setBuilderCharacter(null);
        }}
        onSave={handleSaveFromBuilder}
        onDuplicate={handleDuplicateCharacter}
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
