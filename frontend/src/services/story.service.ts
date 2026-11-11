import { getApiUrl } from '../utils/urlHelper';

export interface Story {
  id: string;
  storyId: string;
  title: string;
  logline: string;
  lesson: string;
  audience?: string | null;
  genre?: string | null;
  visualStyle?: string | null;
  flowProjectId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowProjectDetails {
  success: boolean;
  storyId: string;
  flowProjectId: string | null;
  projectUrl: string | null;
  isConnected: boolean;
  message?: string;
}

export async function getStoryFlowProject(storyId: string): Promise<FlowProjectDetails> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/stories/${storyId}/flow-project`);
  if (!response.ok) {
    throw new Error('Failed to fetch Google Flow project details');
  }
  return response.json();
}

export async function connectStoryFlowProject(storyId: string, projectUrl: string): Promise<FlowProjectDetails> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/stories/${storyId}/flow-project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectUrl }),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to connect Google Flow project');
  }
  return response.json();
}

export async function disconnectStoryFlowProject(storyId: string): Promise<FlowProjectDetails> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/stories/${storyId}/flow-project`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to disconnect Google Flow project');
  }
  return response.json();
}

export async function getAllStories(): Promise<Story[]> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/stories`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch stories');
  }
  
  return response.json();
}

export async function deleteStory(storyId: string): Promise<void> {
  const API_URL = getApiUrl();
  const response = await fetch(`${API_URL}/api/content/story/${storyId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete story');
  }
}
