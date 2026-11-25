import { ensureBrowser } from "@remotion/renderer";

/**
 * Pre-download the exact Chrome Headless Shell revision required by the
 * installed @remotion/renderer version. This makes CI and production setup
 * deterministic without depending on the optional Remotion CLI package.
 */
async function main(): Promise<void> {
  const browser = await ensureBrowser();

  if (!("path" in browser) || !browser.path) {
    throw new Error(
      `Remotion browser setup did not produce a usable browser (status: ${browser.type}).`,
    );
  }

  console.log(`Remotion browser is ready: ${browser.path}`);
}

main().catch((error: unknown) => {
  console.error(
    "[Remotion] Failed to prepare browser:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
