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
      <div className="corp-shell">
        <div className="escalation-topbar">
          <span className="escalation-topbar-icon">SD</span>
          <span className="escalation-topbar-title">Service Desk</span>
        </div>
        <div className="corp-container">
          <h2 className="corp-signin-title" style={{ marginBottom: '4px' }}>
            {isPractice ? strings.file_review_header : strings.reveal_header}
          </h2>
          <p className="corp-card-body" style={{ marginBottom: '20px' }}>
            {isPractice ? strings.file_review_intro : strings.reveal_intro}
          </p>

          {mine && (
            <div className="corp-outcome-block">
              <p className="corp-outcome-label">{strings.reveal_you_chose_prefix} {your_choice.option_chosen}</p>
              {mine.setup && <p>{mine.setup}</p>}
              <p>{mine.outcomes[your_choice.option_chosen]}</p>
              <p className="corp-concept-line">{mine.concept}</p>
            </div>
          )}

          {!isPractice && (
            <>
              <p className="corp-matrix-heading">{strings.reveal_matrix_header}</p>
              {matrix.map((m) => (
                <div key={m.variant} className="corp-variant-block">
                  <p className="corp-variant-label">{strings.reveal_variant_label} {m.variant}</p>
                  <p>{m.setup}</p>
                  {['A', 'B', 'C'].map((opt) => (
                    <p key={opt}>
                      <strong>{opt}:</strong> {m.outcomes[opt]}
                    </p>
                  ))}
                  <p className="corp-concept-line">{m.concept}</p>
                </div>
              ))}
            </>
          )}

          <p className="corp-card-body" style={{ marginTop: '20px' }}>{strings.escalation_bridge_line}</p>
          <button
            type="button"
            className="escalation-btn-primary"
            onClick={() => gotoEscalationForm(caseId, your_choice ? your_choice.option_chosen : null)}
          >
            {strings.escalation_log_it_button}
          </button>
        </div>
      </div>
    </Stage>
  );
}
