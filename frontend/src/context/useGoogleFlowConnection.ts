import { useContext } from 'react';
import {
  GoogleFlowConnectionContext,
  type GoogleFlowConnectionContextType,
} from './GoogleFlowConnectionContext';

export function useGoogleFlowConnection(): GoogleFlowConnectionContextType {
  const context = useContext(GoogleFlowConnectionContext);
  if (!context) {
    throw new Error('useGoogleFlowConnection must be used within a GoogleFlowConnectionProvider');
  }
  return context;
}
