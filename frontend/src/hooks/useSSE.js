/**
 * useSSE – Custom React hook for consuming Server-Sent Events from the backend.
 *
 * Usage:
 *   const { messages, isStreaming, startStream } = useSSE();
 *
 * The hook manages the EventSource lifecycle, parses JSON payloads,
 * and accumulates streamed tokens into a growing message buffer.
 */
import { useCallback, useRef, useState } from 'react';
import { getAuthHeaders } from '../services/api';

export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const [agentSteps, setAgentSteps] = useState([]);
  const [error, setError] = useState(null);
  const readerRef = useRef(null);

  /**
   * Start streaming from `url` using fetch + ReadableStream (works with auth headers).
   * Falls back gracefully on errors.
   *
   * @param {string} url           - Full API endpoint URL
   * @param {object} body          - JSON request body
   * @param {function} onToken     - Called with each accumulated string
   * @param {function} onDone      - Called with final full response string
   * @param {function} onAgentStep - Called with each agent step object
   */
  const startStream = useCallback(async (url, body, { onToken, onDone, onAgentStep, onError: onErrorCallback } = {}) => {
    setIsStreaming(true);
    setStreamBuffer('');
    setAgentSteps([]);
    setError(null);

    let accumulated = '';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') {
            onDone?.(accumulated);
            break;
          }

          let parsed;
          try { parsed = JSON.parse(raw); } catch { continue; }

          if (parsed.type === 'token') {
            accumulated += parsed.content;
            setStreamBuffer(accumulated);
            onToken?.(accumulated);
          } else if (parsed.type === 'tool_call' || parsed.type === 'tool_result') {
            const step = {
              type: parsed.type,
              content: parsed.content,
              tool_name: parsed.tool_name,
            };
            setAgentSteps(prev => [...prev, step]);
            onAgentStep?.(step);
          } else if (parsed.type === 'error') {
            throw new Error(parsed.content);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        onErrorCallback?.(err.message);
        onDone?.('');
      }
    } finally {
      setIsStreaming(false);
      readerRef.current = null;
    }
  }, []);

  const cancelStream = useCallback(() => {
    readerRef.current?.cancel();
    setIsStreaming(false);
  }, []);

  return { isStreaming, streamBuffer, agentSteps, error, startStream, cancelStream };
}
