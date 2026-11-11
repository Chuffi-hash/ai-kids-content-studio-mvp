import { useState, useEffect, useCallback } from 'react';
import {
  getStoryFlowProject,
  connectStoryFlowProject,
  disconnectStoryFlowProject,
  FlowProjectDetails,
} from '../services/story.service';

export function useGoogleFlowProject(storyId?: string | null) {
  const [details, setDetails] = useState<FlowProjectDetails>({
    success: true,
    storyId: storyId || '',
    flowProjectId: null,
    projectUrl: null,
    isConnected: false,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!storyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStoryFlowProject(storyId);
      setDetails(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Google Flow project association');
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const connect = async (inputUrl: string) => {
    if (!storyId) throw new Error('No active story ID specified');
    setLoading(true);
    setError(null);
    try {
      const result = await connectStoryFlowProject(storyId, inputUrl);
      setDetails(result);
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to connect Google Flow project');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    if (!storyId) throw new Error('No active story ID specified');
    setLoading(true);
    setError(null);
    try {
      const result = await disconnectStoryFlowProject(storyId);
      setDetails(result);
      return result;
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect Google Flow project');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const openFlowProject = () => {
    if (!details.flowProjectId) {
      return { success: false, reason: 'NOT_CONNECTED' };
    }
    const targetUrl = `https://flow.google.com/project/${details.flowProjectId}`;
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    return { success: true, url: targetUrl };
  };

  return {
    ...details,
    loading,
    error,
    connect,
    disconnect,
    openFlowProject,
    refresh: fetchDetails,
  };
}
