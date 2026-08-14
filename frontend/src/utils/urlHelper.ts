const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5001";

/**
 * Resolves asset URLs by prepending the API base URL if the URL is relative.
 * Handles both relative URLs (e.g., /storage/scenes/file.png) and absolute URLs.
 */
export function resolveAssetUrl(url: string | undefined): string {
  if (!url) return "";

  // If URL is already absolute (starts with http:// or https://), return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Prepend API base URL for relative URLs
  return `${API_URL}${url}`;
}

export function getApiUrl(): string {
  return API_URL;
}
