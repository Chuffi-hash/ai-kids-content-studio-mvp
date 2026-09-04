import { getApiUrl } from "../utils/urlHelper";

export interface StorybookImage {
  id: string;
  sceneId: string;
  provider: string;
  model: string;
  prompt: string;
  storageKey: string;
  imageUrl: string;
  width: number;
  height: number;
  status: "completed" | "generating" | "pending" | "failed";
}

export interface StorybookScene {
  id: string;
  sceneId: string;
  storyId: string;
  title: string;
  number: number;
  narration: string;
  image: StorybookImage | null;
  deletedAt?: string | null;
}

export interface StorybookStory {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  topic?: string | null;
  ageGroup?: string | null;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  characters?: Array<{
    id: string;
    name: string;
    species: string;
    personality: string;
    description: string;
    referenceImageUrl?: string | null;
    canonicalAppearance?: any;
  }>;
  scenes: StorybookScene[];
}

export async function fetchStory(storyId: string, includeDeleted: boolean = false): Promise<StorybookStory> {
  const API_URL = getApiUrl();
  const url = includeDeleted 
    ? `${API_URL}/api/content/story/${storyId}?includeDeleted=true`
    : `${API_URL}/api/content/story/${storyId}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Story not found");
    }
    throw new Error("Failed to fetch story");
  }

  return response.json();
}
