import React from 'react';
import { useGame } from '../state/machine';
import { useStrings } from '../state/strings';
import Stage from '../components/Stage';

export default function Reveal() {
  const { state, gotoEscalationForm } = useGame();
  const strings = useStrings();
  const { revealData, caseData, caseId } = state;

  if (!revealData) return null;

  const isPractice = caseData && caseData.kind === 'practice';
  const { matrix, your_choice } = revealData;
  const mine = your_choice ? matrix.find((m) => m.variant === your_choice.variant) : null;

  return (
    <Stage>
    <div className="app-shell landscape-panel">
    <div className="reveal-shell">
      <p className="title" style={{ fontWeight: 700 }}>
        {isPractice ? strings.file_review_header : strings.reveal_header}
      </p>
      <p className="bhau-line">{isPractice ? strings.file_review_intro : strings.reveal_intro}</p>

      {mine && (
        <div style={{ margin: '20px 0', padding: '16px', background: 'var(--teal)', borderRadius: '8px' }}>
          <p style={{ color: 'var(--paper-dim)' }}>{strings.reveal_you_chose_prefix} {your_choice.option_chosen}</p>
          {mine.setup && <p>{mine.setup}</p>}
          <p>{mine.outcomes[your_choice.option_chosen]}</p>
          <p className="concept-line">{mine.concept}</p>
        </div>
      )}

      {!isPractice && (
        <>
          <h3>{strings.reveal_matrix_header}</h3>
          {matrix.map((m) => (
            <div key={m.variant} style={{ marginBottom: '20px' }}>
              <p style={{ color: 'var(--paper-dim)' }}>{strings.reveal_variant_label} {m.variant}</p>
              <p>{m.setup}</p>
              {['A', 'B', 'C'].map((opt) => (
                <p key={opt}>
                  <strong>{opt}:</strong> {m.outcomes[opt]}
                </p>
              ))}
              <p className="concept-line">{m.concept}</p>
            </div>
          ))}
        </>
      )}

      <p className="bhau-line" style={{ marginTop: '20px' }}>{strings.escalation_bridge_line}</p>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => gotoEscalationForm(caseId, your_choice ? your_choice.option_chosen : null)}
      >
        {strings.escalation_log_it_button}
      </button>
    </div>
    </div>
    </Stage>
  );
}
