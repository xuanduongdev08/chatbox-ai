/**
 * useSSE – consume Server-Sent Events from the backend via fetch + ReadableStream
 * (EventSource can't send auth headers).
 *
 * - Buffers partial lines across network chunks.
 * - cancelStream() stops the request and still delivers the partial answer via onDone.
 * - onConversationId receives the X-Conversation-Id response header.
 */
import { useCallback, useRef, useState } from 'react';
import { getAuthHeaders } from '../services/api';

export function useSSE() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const cancelledRef = useRef(false);

  const startStream = useCallback(
    async (url, body, { onToken, onDone, onAgentStep, onError, onConversationId } = {}) => {
      setIsStreaming(true);
      setAgentSteps([]);
      setError(null);
      cancelledRef.current = false;

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = '';
      let finished = false;
      const finish = (text) => {
        if (finished) return;
        finished = true;
        onDone?.(text);
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (response.status === 401) window.dispatchEvent(new Event('auth:expired'));
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(typeof errData.detail === 'string' ? errData.detail : `HTTP ${response.status}`);
        }

        const convId = response.headers.get('X-Conversation-Id');
        if (convId) onConversationId?.(convId);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') {
              finish(accumulated);
              continue;
            }
            let parsed;
            try { parsed = JSON.parse(raw); } catch { continue; }

            if (parsed.type === 'token') {
              accumulated += parsed.content;
              onToken?.(accumulated);
            } else if (parsed.type === 'tool_call' || parsed.type === 'tool_result') {
              const step = { type: parsed.type, content: parsed.content, tool_name: parsed.tool_name };
              setAgentSteps((prev) => [...prev, step]);
              onAgentStep?.(step);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.content);
            }
          }
        }
        finish(accumulated);
      } catch (err) {
        if (err.name === 'AbortError' || cancelledRef.current) {
          finish(accumulated); // keep whatever was generated before the user pressed stop
        } else {
          setError(err.message);
          onError?.(err.message);
          finish('');
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    []
  );

  const cancelStream = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  }, []);

  return { isStreaming, agentSteps, error, startStream, cancelStream };
}
