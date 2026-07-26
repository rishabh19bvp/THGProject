import React, { useState } from 'react';
import { useGame } from '../state/machine';
import { useStrings } from '../state/strings';
import { postEscalationSubmit } from '../state/api';
import Stage from '../components/Stage';

const CATEGORIES = ['Service Request', 'Access Request', 'Standard Change', 'Major Incident'];
const LEVELS = ['Low', 'Medium', 'High', 'Extensive'];
const URGENCY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
const NOTIFY_GROUPS = ['WMS Engineering', 'Floor Operations', 'Peak Readiness Owner', 'No one — closing as routine'];
const NO_ESCALATION_GROUP = 'No one — closing as routine';

// Impact x Urgency -> Priority, mirrored from server/index.js's copy (the
// server recomputes and persists its own — this is only the live preview).
const PRIORITY_MATRIX = {
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium', Critical: 'Medium' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'Medium', Critical: 'High' },
  High: { Low: 'Medium', Medium: 'Medium', High: 'High', Critical: 'Critical' },
  Extensive: { Low: 'Medium', Medium: 'High', High: 'Critical', Critical: 'Critical' },
};

export default function EscalationForm() {
  const { state, gotoDepot } = useGame();
  const strings = useStrings();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [impact, setImpact] = useState('');
  const [urgency, setUrgency] = useState('');
  const [description, setDescription] = useState('');
  const [notifyGroup, setNotifyGroup] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { priority, notify_group } | null

  const priority = impact && urgency ? PRIORITY_MATRIX[impact][urgency] : null;
  const canSubmit = title.trim() && category && impact && urgency && notifyGroup && !submitting;

  function resetForm() {
    setTitle('');
    setCategory('');
    setImpact('');
    setUrgency('');
    setDescription('');
    setNotifyGroup('');
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const data = await postEscalationSubmit({
      roll_number: state.roll,
      case_id: state.caseId,
      category,
      impact,
      urgency,
      notify_group: notifyGroup,
      description,
      narrative_option_chosen: state.narrativeOptionChosen,
    });
    setResult({ priority: data.priority, notify_group: notifyGroup });
    setSubmitting(false);
  }

  if (result) {
    const message =
      result.notify_group === NO_ESCALATION_GROUP
        ? strings.escalation_submitted_no_escalation
        : strings.escalation_submitted_with_escalation
            .replace('{priority}', result.priority)
            .replace('{group}', result.notify_group);

    return (
      <Stage>
      <div className="app-shell landscape-panel">
        <div className="escalation-shell">
          <div className="escalation-topbar">
            <span className="escalation-topbar-icon">SD</span>
            <span className="escalation-topbar-title">Service Desk</span>
          </div>
          <div className="escalation-header-row">
            <h2 className="escalation-title">{strings.escalation_form_header}</h2>
          </div>
          <div className="escalation-confirm">
            <p>{message}</p>
          </div>
          <div className="escalation-actions">
            <button type="button" className="escalation-btn-primary" onClick={gotoDepot}>
              {strings.escalation_return_button}
            </button>
          </div>
        </div>
      </div>
      </Stage>
    );
  }

  return (
    <Stage>
    <div className="app-shell landscape-panel">
      <div className="escalation-shell">
        <div className="escalation-topbar">
          <span className="escalation-topbar-icon">SD</span>
          <span className="escalation-topbar-title">Service Desk</span>
        </div>
        <div className="escalation-header-row">
          <h2 className="escalation-title">{strings.escalation_form_header}</h2>
        </div>
        <p className="escalation-section-label">Incident Details</p>

        <div className="escalation-field">
          <label className="escalation-label">
            <span className="escalation-required">*</span>{strings.escalation_title_label}
          </label>
          <input
            type="text"
            className="escalation-input"
            placeholder={strings.escalation_title_placeholder}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="escalation-field">
          <label className="escalation-label">
            <span className="escalation-required">*</span>{strings.escalation_category_label}
          </label>
          <select className="escalation-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="" disabled>-- Select Category --</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="escalation-row">
          <div className="escalation-field">
            <label className="escalation-label">
              <span className="escalation-required">*</span>{strings.escalation_impact_label}
            </label>
            <select className="escalation-select" value={impact} onChange={(e) => setImpact(e.target.value)}>
              <option value="" disabled>-- Select --</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="escalation-field">
            <label className="escalation-label">
              <span className="escalation-required">*</span>{strings.escalation_urgency_label}
            </label>
            <select className="escalation-select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
              <option value="" disabled>-- Select --</option>
              {URGENCY_LEVELS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="escalation-field">
          <label className="escalation-label">{strings.escalation_priority_label}</label>
          <div className="escalation-priority-readout">
            {priority || strings.escalation_priority_placeholder}
          </div>
        </div>

        <div className="escalation-field">
          <label className="escalation-label">{strings.escalation_description_label}</label>
          <div className="escalation-toolbar" aria-hidden="true">
            <span style={{ fontWeight: 700 }}>B</span>
            <span style={{ fontStyle: 'italic' }}>I</span>
            <span style={{ textDecoration: 'underline' }}>U</span>
            <span className="divider" />
            <span>☰</span>
            <span>≣</span>
          </div>
          <textarea
            className="escalation-textarea with-toolbar"
            placeholder={strings.escalation_description_placeholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="escalation-field">
          <label className="escalation-label">
            <span className="escalation-required">*</span>{strings.escalation_notify_label}
          </label>
          <select className="escalation-select" value={notifyGroup} onChange={(e) => setNotifyGroup(e.target.value)}>
            <option value="" disabled>-- Select Group --</option>
            {NOTIFY_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div className="escalation-actions">
          <button type="button" className="escalation-btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
            {strings.escalation_submit_button}
          </button>
          <button type="button" className="escalation-btn-secondary" onClick={resetForm}>
            Reset
          </button>
        </div>
      </div>
    </div>
    </Stage>
  );
}
