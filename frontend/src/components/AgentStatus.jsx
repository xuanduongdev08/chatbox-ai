/**
 * AgentStatus – collapsible card showing agent tool calls / results.
 */
import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Wrench, Zap } from 'lucide-react';
import { useI18n } from '../context/AppContext';

export function AgentStatus({ steps = [], isStreaming = false }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);

  if (steps.length === 0 && !isStreaming) return null;

  return (
    <div className="agent-card fade-in">
      <button className="agent-head" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <Zap size={16} />
        <span>{t('agentReasoning')}{isStreaming ? '…' : ''}</span>
        <span className="chev">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
      </button>

      {expanded && (
        <div>
          {steps.map((step, i) => (
            <div className="agent-step" key={i}>
              <div className={`agent-step-icon ${step.type === 'tool_call' ? 'call' : 'result'}`}>
                {step.type === 'tool_call' ? <Wrench size={13} /> : <CheckCircle2 size={13} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="agent-step-label">
                  {step.type === 'tool_call' ? t('toolCall') : t('toolResult')}
                </div>
                {step.tool_name && <div className="agent-step-tool">{step.tool_name}</div>}
                <div className="agent-step-content">{step.content}</div>
              </div>
            </div>
          ))}

          {isStreaming && steps.length === 0 && (
            <div className="agent-thinking">
              <div className="spinner" />
              <span>{t('agentThinking')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
