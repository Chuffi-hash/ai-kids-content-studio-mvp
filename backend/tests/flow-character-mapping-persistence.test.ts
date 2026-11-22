import test, { describe, before, after } from 'node:test';
import assert from 'node:assert';
import {
  prisma,
  createStory,
  createCharacter,
  upsertFlowCharacterMapping,
  getFlowCharacterMapping,
  deleteFlowCharacterMapping,
  createFlowCharacterVersion,
  getFlowCharacterVersions,
  restoreFlowCharacterVersion,
} from '../src/services/database/database.service.js';

describe('Prisma FlowCharacterMapping & FlowCharacterVersion Persistence Suite', () => {
  const storyId = `test-char-story-${Date.now()}`;
  const characterId = `test-char-id-${Date.now()}`;
  const flowProjectId = '2ea32335-0e57-4d1a-9e1e-98fa3cd491e8';

  before(async () => {
    // Create prerequisite story and character records
    await createStory({
      storyId,
      title: 'Character Mapping Test Story',
      logline: 'Testing flowCharacterId persistence in Prisma',
    });

    await createCharacter({
      id: characterId,
      name: 'Pippin',
      species: 'Rabbit',
      personality: 'Curious',
      visualDescription: 'A small brown rabbit',
      distinctiveFeatures: 'Floppy ears',
    });
  });

  after(async () => {
    try {
      await deleteFlowCharacterMapping(storyId, characterId).catch(() => {});
      await prisma.story.delete({ where: { storyId } }).catch(() => {});
      await prisma.character.delete({ where: { id: characterId } }).catch(() => {});
    } catch {}
  });

  test('1. upsertFlowCharacterMapping persists flowCharacterId and flowCharacterUrl', async () => {
    const mapping = await upsertFlowCharacterMapping({
      storyId,
      characterId,
      flowProjectId,
      flowCharacterName: 'Pippin in Flow',
      flowCharacterId: 'google-flow-character-id-123',
      flowCharacterUrl: 'https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character/google-flow-character-id-123',
      activeVersion: 1,
      syncStatus: 'synced',
    });

    assert.ok(mapping);
    assert.strictEqual(mapping.flowCharacterId, 'google-flow-character-id-123');
    assert.strictEqual(
      mapping.flowCharacterUrl,
      'https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character/google-flow-character-id-123',
    );
    assert.strictEqual(mapping.activeVersion, 1);

    // Read back through getFlowCharacterMapping
    const retrieved = await getFlowCharacterMapping(storyId, characterId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.flowCharacterId, 'google-flow-character-id-123');
    assert.strictEqual(
      retrieved.flowCharacterUrl,
      'https://flow.google.com/project/2ea32335-0e57-4d1a-9e1e-98fa3cd491e8/character/google-flow-character-id-123',
    );
    assert.strictEqual(retrieved.activeVersion, 1);
  });

  test('2. upsertFlowCharacterMapping correctly updates with null flowCharacterId and flowCharacterUrl', async () => {
    const updated = await upsertFlowCharacterMapping({
      storyId,
      characterId,
      flowProjectId,
      flowCharacterName: 'Pippin in Flow',
      flowCharacterId: null,
      flowCharacterUrl: null,
      syncStatus: 'pending',
    });

    assert.ok(updated);
    assert.strictEqual(updated.flowCharacterId, null);
    assert.strictEqual(updated.flowCharacterUrl, null);

    // Read back to confirm null in database
    const retrieved = await getFlowCharacterMapping(storyId, characterId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.flowCharacterId, null);
    assert.strictEqual(retrieved.flowCharacterUrl, null);
  });

  test('3. FlowCharacterVersion model creates and retrieves version history', async () => {
    // Re-set mapping with active version
    const mapping = await upsertFlowCharacterMapping({
      storyId,
      characterId,
      flowProjectId,
      flowCharacterName: 'Pippin',
      flowCharacterId: 'char-v1',
      flowCharacterUrl: 'https://flow.google.com/project/p1/character/char-v1',
      activeVersion: 1,
    });

    const v1 = await createFlowCharacterVersion({
      mappingId: mapping.id,
      version: 1,
      flowProjectId,
      flowCharacterId: 'char-v1',
      flowCharacterUrl: 'https://flow.google.com/project/p1/character/char-v1',
      characterName: 'Pippin V1',
      prompt: 'A joyful rabbit wearing blue suspenders',
    });

    assert.ok(v1);
    assert.strictEqual(v1.version, 1);
    assert.strictEqual(v1.flowCharacterId, 'char-v1');

    const v2 = await createFlowCharacterVersion({
      mappingId: mapping.id,
      version: 2,
      flowProjectId,
      flowCharacterId: 'char-v2',
      flowCharacterUrl: 'https://flow.google.com/project/p1/character/char-v2',
      characterName: 'Pippin V2',
      prompt: 'A joyful rabbit wearing red suspenders and a green hat',
    });

    assert.ok(v2);
    assert.strictEqual(v2.version, 2);

    const versions = await getFlowCharacterVersions(mapping.id);
    assert.ok(versions.length >= 2);
    assert.strictEqual(versions[0].version, 2); // Ordered desc

    // Test restoring previous version
    await restoreFlowCharacterVersion(mapping.id, 1);
    const restoredMapping = await getFlowCharacterMapping(storyId, characterId);
    assert.strictEqual(restoredMapping?.activeVersion, 1);
    assert.strictEqual(restoredMapping?.flowCharacterId, 'char-v1');
  });
});
