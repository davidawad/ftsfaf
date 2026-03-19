/**
 * React hook for Server-Sent Events
 */

import { useEffect, useState, useCallback } from 'react';
import type { Run, SSEMessage } from '../lib/types';

export function useSSE() {
  const [updates, setUpdates] = useState<Run[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('connected', () => {
      setIsConnected(true);
      console.log('SSE connected');
    });

    eventSource.addEventListener('run-updated', (event) => {
      const message: SSEMessage = JSON.parse(event.data);
      if (message.data) {
        setUpdates((prev) => [...prev, message.data as Run]);
      }
    });

    eventSource.onerror = () => {
      setIsConnected(false);
      console.log('SSE disconnected, reconnecting...');
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  const clearUpdates = useCallback(() => {
    setUpdates([]);
  }, []);

  return { updates, isConnected, clearUpdates };
}
