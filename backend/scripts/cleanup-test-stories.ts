import { prisma } from '../src/services/database/database.service.js';

async function cleanupTestStories() {
  const stories = await prisma.story.findMany({
    select: {
      id: true,
      storyId: true,
      title: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Total stories currently in database: ${stories.length}`);
  for (const s of stories) {
    console.log(`- ${s.storyId}: "${s.title}" (${s.createdAt.toISOString()})`);
  }

  // Filter test stories
  const testStories = stories.filter(
    (s) =>
      s.storyId.startsWith('story-audit-') ||
      s.storyId.startsWith('story-persistence-') ||
      s.storyId.startsWith('story-autosave-') ||
      s.storyId.startsWith('story-10s-export-') ||
      s.storyId.startsWith('story-legacy-') ||
      s.storyId.startsWith('story-anim-') ||
      s.title.includes('Test Story') ||
      s.title.includes('Verification Story Audit') ||
      s.title.includes('Pip and Sammy Forest Walk (10-Second 30FPS MP4)') ||
      s.title.includes('Pip the Bear 2D Animation Studio Test') ||
      s.title.includes('Legacy Workflow Test')
  );

  console.log(`\nFound ${testStories.length} test stories to remove.`);

  for (const s of testStories) {
    // Delete scenes, versions, images, storyCharacters
    await prisma.image.deleteMany({ where: { scene: { storyId: s.storyId } } });
    await prisma.sceneVersion.deleteMany({ where: { scene: { storyId: s.storyId } } });
    await prisma.scene.deleteMany({ where: { storyId: s.storyId } });
    await prisma.storyCharacter.deleteMany({ where: { storyId: s.storyId } });
    await prisma.story.delete({ where: { storyId: s.storyId } });
    console.log(`✓ Deleted test story: ${s.storyId} ("${s.title}")`);
  }

  const remaining = await prisma.story.findMany({ select: { storyId: true, title: true } });
  console.log(`\nRemaining real user stories in database: ${remaining.length}`);
  for (const r of remaining) {
    console.log(`- ${r.storyId}: "${r.title}"`);
  }
}

cleanupTestStories()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

