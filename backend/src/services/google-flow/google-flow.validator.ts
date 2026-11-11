/**
 * Google Flow Project URL validator and ID extractor.
 */

const VALID_ID_PATTERN = /^[a-zA-Z0-9\-_]{6,64}$/;

export interface FlowProjectValidationResult {
  valid: boolean;
  flowProjectId?: string;
  projectUrl?: string;
  error?: string;
}

export function validateAndExtractFlowProjectId(rawInput: string): FlowProjectValidationResult {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      valid: false,
      error: 'Google Flow project URL or project ID is required.',
    };
  }

  const trimmed = rawInput.trim();

  // 1. Direct project ID / UUID input
  if (VALID_ID_PATTERN.test(trimmed) && !trimmed.includes('/') && !trimmed.includes(':')) {
    return {
      valid: true,
      flowProjectId: trimmed,
      projectUrl: `https://flow.google.com/project/${trimmed}`,
    };
  }

  // 2. URL parsing & validation
  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format. Expected a valid Google Flow project URL (e.g. https://flow.google.com/project/<id>).',
    };
  }

  // Validate allowed Google Flow hosts
  const host = parsedUrl.hostname.toLowerCase();
  const allowedHosts = ['flow.google.com', 'www.flow.google.com', 'labs.google'];
  const isAllowedHost = allowedHosts.some((h) => host === h || host.endsWith('.' + h));

  if (!isAllowedHost) {
    return {
      valid: false,
      error: `Invalid host "${host}". Google Flow projects must be hosted on flow.google.com.`,
    };
  }

  // Path check: /project/:id or /flow/project/:id
  const path = parsedUrl.pathname;
  const projectMatch = path.match(/\/(?:flow\/)?project\/([a-zA-Z0-9\-_]+)/i);

  if (!projectMatch || !projectMatch[1]) {
    return {
      valid: false,
      error: 'Could not extract project ID from URL. Expected path format: /project/{projectId}.',
    };
  }

  const extractedId = projectMatch[1];
  if (!VALID_ID_PATTERN.test(extractedId)) {
    return {
      valid: false,
      error: 'Extracted Google Flow project ID contains invalid characters.',
    };
  }

  return {
    valid: true,
    flowProjectId: extractedId,
    projectUrl: `https://flow.google.com/project/${extractedId}`,
  };
}
