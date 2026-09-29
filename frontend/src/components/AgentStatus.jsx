/**
 * AgentStatus – Visual indicator for agent tool execution steps.
 * Shows a collapsible card with each tool_call and tool_result event.
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp, Wrench, CheckCircle2, Zap } from 'lucide-react';

function StepIcon({ type }) {
  if (type === 'tool_call') return <Wrench size={11} />;
  if (type === 'tool_result') return <CheckCircle2 size={11} />;
  return <Zap size={11} />;
}

function StepLabel({ type }) {
  const labels = {
    tool_call: 'Tool Call',
    tool_result: 'Tool Result',
    thought: 'Thought',
  };
  return <div className="agent-step-label">{labels[type] || type}</div>;
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
          color: 'var(--warning)',
          cursor: 'pointer',
          padding: 0,
          marginBottom: expanded ? '10px' : 0,
          fontFamily: 'var(--font-sans)',
        }}
      >
        <Zap size={14} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
          Agent Reasoning {isStreaming && '…'}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
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
                <StepLabel type={step.type} />
                {step.tool_name && (
                  <span style={{
                    fontSize: 11,
                    color: 'var(--accent-light)',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <div className="spinner" style={{ borderTopColor: 'var(--warning)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Agent is thinking…
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
