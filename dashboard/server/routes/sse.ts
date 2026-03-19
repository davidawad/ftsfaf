/**
 * Server-Sent Events (SSE) for real-time updates
 */

import { Hono } from 'hono';
import { getStreamUrl } from '../lib/engine-client';

const sse = new Hono();

// SSE endpoint - proxy from engine
sse.get('/stream', async (c) => {
  const engineStreamUrl = getStreamUrl();
  
  try {
    // Proxy the SSE stream from the engine
    const response = await fetch(engineStreamUrl);
    
    if (!response.ok) {
      return c.json({ error: 'Failed to connect to engine stream' }, 500);
    }
    
    // Return the response stream directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Failed to proxy SSE stream:', error);
    return c.json({ error: 'Failed to connect to engine' }, 500);
  }
});

export default sse;
