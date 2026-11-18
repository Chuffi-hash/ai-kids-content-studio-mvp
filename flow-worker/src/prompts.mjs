export const FLOW_HOME_URL = "https://labs.google/fx/tools/flow";

export const CHARACTER_VIEW_LABELS = Object.freeze({
  front: "front-facing view",
  "front-left": "front three-quarter view turned slightly to the left",
  "front-right": "front three-quarter view turned slightly to the right",
  left: "left side profile",
  right: "right side profile",
  "back-left": "rear three-quarter view turned slightly to the left",
  "back-right": "rear three-quarter view turned slightly to the right",
  back: "full rear view, seen from behind"
});

const ALLOWED_FLOW_HOSTS = new Set(["labs.google", "flow.google.com"]);

export function assertAllowedFlowUrl(value) {
  const parsed = new URL(value || FLOW_HOME_URL);

  if (parsed.protocol !== "https:" || !ALLOWED_FLOW_HOSTS.has(parsed.hostname)) {
    throw new Error("Only HTTPS Google Flow URLs are allowed.");
  }

  return parsed.toString();
}

export function buildCharacterViewPrompt({
  characterName,
  view,
  additionalInstructions = ""
}) {
  const name = String(characterName || "").trim();
  const label = CHARACTER_VIEW_LABELS[view];

  if (!name) {
    throw new Error("characterName is required.");
  }

  if (!label) {
    throw new Error("Unsupported character view: " + String(view));
  }

  const parts = [
    "Use the saved Google Flow character reference named @" + name + " as the exact subject identity.",
    "Create ONE standalone, full-body character artwork in a " + label + ".",
    "Preserve the exact same character identity, face shape, eye design, colors, clothing, accessories, body proportions, silhouette, and illustration style.",
    "Show the complete character from head to feet with the entire silhouette inside the frame.",
    "Use a clean, plain, uncluttered background suitable for importing as a reusable character asset.",
    "Do not redesign the character, add extra characters, add text, add labels, add a collage, or create a multi-view turnaround sheet.",
    "This must be a genuine authored view of the character, not a horizontally flipped or rotated copy of another view."
  ];

  const extra = String(additionalInstructions || "").trim();
  if (extra) parts.push("Additional direction: " + extra);

  return parts.join("\n\n");
}
