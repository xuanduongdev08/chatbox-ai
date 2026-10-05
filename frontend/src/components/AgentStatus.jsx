/**
 * AgentStatus – Visual indicator for agent tool execution steps.
 * Shows a collapsible card with each tool_call and tool_result event.
 *
 * Colors: AIZOX Yellow for tool calls, Primary green for results.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench, CheckCircle2, Zap } from 'lucide-react';

function StepIcon({ type }) {
  if (type === 'tool_call')   return <Wrench size={11} />;
  if (type === 'tool_result') return <CheckCircle2 size={11} />;
  return <Zap size={11} />;
}

export function AgentStatus({ steps = [], isStreaming = false }) {
  const [expanded, setExpanded] = useState(true);

  if (steps.length === 0 && !isStreaming) return null;

  return (
    <div className="agent-status-card fade-in">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          background: 'none',
          border: 'none',
          color: 'var(--Yellow)',
          cursor: 'pointer',
          padding: 0,
          marginBottom: expanded ? '10px' : 0,
          fontFamily: 'var(--font-sans)',
        }}
        aria-expanded={expanded}
      >
        <Zap size={14} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em' }}>
          Agent Reasoning {isStreaming && '…'}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--Secondary)' }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {/* Steps */}
      {expanded && (
        <div>
          {steps.map((step, i) => (
            <div className="agent-step" key={i}>
              <div
                className={`agent-step-icon ${
                  step.type === 'tool_call' ? 'icon-tool-call' : 'icon-tool-result'
                }`}
              >
                <StepIcon type={step.type} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="agent-step-label">
                  {step.type === 'tool_call' ? 'Tool Call' : 'Tool Result'}
                </div>
                {step.tool_name && (
                  <span style={{
                    fontSize: 11,
                    color: 'var(--Primary)',
                    fontWeight: 600,
                    marginBottom: 3,
                    display: 'block',
                  }}>
                    {step.tool_name}
                  </span>
                )}
                <div className="agent-step-content">{step.content}</div>
              </div>
            </div>
          ))}

          {isStreaming && steps.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <div className="spinner" />
              <span style={{ fontSize: 13, color: 'var(--Secondary)' }}>
                Agent is thinking…
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
