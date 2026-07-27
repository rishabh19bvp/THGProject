import React, { useEffect, useState } from 'react';
import { useGame } from '../state/machine';
import { useStrings } from '../state/strings';
import Stage from '../components/Stage';
import {
  fetchDrill,
  fetchTicket,
  createTicket,
  setTicketPriority,
  setTicketNotify,
  addTicketWorklog,
  closeTicket,
} from '../state/api';

// Impact x Urgency -> Priority, mirrored from server/index.js's copy (the
// server recomputes and persists its own — this is only the live preview).
const PRIORITY_MATRIX = {
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium', Critical: 'Medium' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'Medium', Critical: 'High' },
  High: { Low: 'Medium', Medium: 'Medium', High: 'High', Critical: 'Critical' },
  Extensive: { Low: 'Medium', Medium: 'High', High: 'Critical', Critical: 'Critical' },
};

const STEP_NUMBER = { drill1: 1, drill2: 2, drill3: 3, drill4: 4, drill5: 5, drill6: 6 };

function Topbar() {
  return (
    <div className="escalation-topbar">
      <span className="escalation-topbar-icon">SD</span>
      <span className="escalation-topbar-title">Service Desk</span>
    </div>
  );
}

function StepLabel({ strings, step }) {
  const n = STEP_NUMBER[step];
  if (!n) return null;
  return (
    <p className="escalation-section-label" style={{ margin: '0 0 16px' }}>
      {strings.drill_step_label.replace('{step}', n)}
    </p>
  );
}

export default function TicketDrill() {
  const { state, gotoDepot } = useGame();
  const { roll, caseId, ticketId: resumeTicketId } = state;
  const strings = useStrings();

  const [drill, setDrill] = useState(null); // { title, brief, drills, options }
  const [step, setStep] = useState(null); // 'brief' | 'drill1'..'drill6' | 'summary'
  const [ticket, setTicket] = useState(null); // { id, ... } once created/resumed
  const [summary, setSummary] = useState(null); // { ticket, events } for the final screen
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // drill1 fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  // drill2/4 fields
  const [impact, setImpact] = useState('');
  const [urgency, setUrgency] = useState('');
  // drill3
  const [notifyGroup, setNotifyGroup] = useState('');
  // drill5
  const [worklogDescription, setWorklogDescription] = useState('');
  const [worklogMinutes, setWorklogMinutes] = useState(15);
  const [firstResponse, setFirstResponse] = useState(false);
  // drill6
  const [fcr, setFcr] = useState(false);
  const [requesterAck, setRequesterAck] = useState(true);
  const [closureCode, setClosureCode] = useState('');
  const [closureComments, setClosureComments] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const d = await fetchDrill(caseId);
      if (cancelled) return;
      setDrill(d);
      setDescription(d.drills.description_seed);
      setWorklogDescription(d.drills.worklog_seed);
      setClosureComments(d.drills.closure_comment_seed);

      if (resumeTicketId) {
        const { ticket: t, events } = await fetchTicket(resumeTicketId);
        if (cancelled) return;
        setTicket(t);
        setTitle(t.title);
        setCategory(t.category);
        setDescription(t.description || d.drills.description_seed);
        setImpact(t.impact || '');
        setUrgency(t.urgency || '');
        setNotifyGroup(t.notify_group || '');

        const priorityEvents = events.filter((e) => e.type === 'PRIORITY_CHANGED').length;
        const hasNotify = !!t.notify_group;
        const hasWorklog = events.some((e) => e.type === 'WORKLOG');
        const isClosed = t.status === 'Closed';
        let resumeStep;
        if (priorityEvents === 0) resumeStep = 'drill2';
        else if (!hasNotify) resumeStep = 'drill3';
        else if (priorityEvents === 1) resumeStep = 'drill4';
        else if (!hasWorklog) resumeStep = 'drill5';
        else if (!isClosed) resumeStep = 'drill6';
        else resumeStep = 'summary';
        setStep(resumeStep);
      } else {
        setStep('brief');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, resumeTicketId]);

  if (!drill || !step) {
    return (
      <Stage>
        <div className="corp-shell">
          <p className="corp-empty" style={{ padding: '32px' }}>{strings.loading_state}</p>
        </div>
      </Stage>
    );
  }

  const priority = impact && urgency ? PRIORITY_MATRIX[impact][urgency] : null;

  async function guard(fn) {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Something went wrong — try again.');
    } finally {
      setBusy(false);
    }
  }

  function handleDrill1() {
    guard(async () => {
      const { id } = await createTicket({
        roll_number: roll,
        case_id: caseId,
        title,
        category,
        description,
      });
      setTicket({ id });
      setStep('drill2');
    });
  }

  function handleDrill2() {
    guard(async () => {
      await setTicketPriority(ticket.id, impact, urgency);
      setStep('drill3');
    });
  }

  function handleDrill3() {
    guard(async () => {
      await setTicketNotify(ticket.id, notifyGroup);
      setStep('drill4');
    });
  }

  function handleDrill4() {
    guard(async () => {
      await setTicketPriority(ticket.id, impact, urgency);
      setStep('drill5');
    });
  }

  function handleDrill5() {
    guard(async () => {
      await addTicketWorklog(ticket.id, worklogDescription, worklogMinutes, firstResponse);
      setStep('drill6');
    });
  }

  function handleDrill6() {
    guard(async () => {
      await closeTicket(ticket.id, { fcr, requesterAck, closureCode, closureComments });
      const full = await fetchTicket(ticket.id);
      setSummary(full);
      setStep('summary');
    });
  }

  return (
    <Stage>
      <div className="corp-shell">
        <Topbar />
        <div className="corp-container">
          {error && (
            <div className="corp-card" style={{ borderColor: '#e0483e' }}>
              <p className="corp-card-body" style={{ margin: 0, color: '#e0483e' }}>{error}</p>
            </div>
          )}

          {step === 'brief' && (
            <div className="corp-card">
              <p className="corp-card-label">{strings.brief_header}</p>
              <p className="corp-card-title">{drill.title}</p>
              {drill.brief.map((line, i) => (
                <p key={i} className="corp-card-body">{line}</p>
              ))}
              <button type="button" className="escalation-btn-primary" disabled={busy} onClick={() => setStep('drill1')}>
                {strings.brief_continue_button}
              </button>
            </div>
          )}

          {step === 'drill1' && (
            <div className="escalation-shell" style={{ margin: 0 }}>
              <StepLabel strings={strings} step={step} />
              <div className="escalation-header-row" style={{ padding: 0, marginBottom: '12px' }}>
                <h2 className="escalation-title">{strings.drill1_header}</h2>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill1_title_label}</label>
                <input
                  type="text"
                  className="escalation-input"
                  placeholder={strings.drill1_title_placeholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill1_category_label}</label>
                <select className="escalation-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="" disabled>-- Select Category --</option>
                  {drill.options.category.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill1_description_label}</label>
                <textarea
                  className="escalation-textarea"
                  style={{ minHeight: '90px' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="escalation-btn-primary"
                disabled={busy || !title.trim() || !category}
                onClick={handleDrill1}
              >
                {strings.drill1_continue_button}
              </button>
            </div>
          )}

          {step === 'drill2' && (
            <div className="escalation-shell" style={{ margin: 0 }}>
              <StepLabel strings={strings} step={step} />
              <div className="escalation-header-row" style={{ padding: 0, marginBottom: '12px' }}>
                <h2 className="escalation-title">{strings.drill2_header}</h2>
              </div>
              <div className="escalation-row" style={{ padding: 0 }}>
                <div className="escalation-field" style={{ padding: 0 }}>
                  <label className="escalation-label">{strings.drill2_impact_label}</label>
                  <select className="escalation-select" value={impact} onChange={(e) => setImpact(e.target.value)}>
                    <option value="" disabled>-- Select --</option>
                    {drill.options.impact.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="escalation-field" style={{ padding: 0 }}>
                  <label className="escalation-label">{strings.drill2_urgency_label}</label>
                  <select className="escalation-select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                    <option value="" disabled>-- Select --</option>
                    {drill.options.urgency.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill2_priority_label}</label>
                <div className="escalation-priority-readout">{priority || strings.drill2_priority_placeholder}</div>
              </div>
              <button
                type="button"
                className="escalation-btn-primary"
                disabled={busy || !impact || !urgency}
                onClick={handleDrill2}
              >
                {strings.drill2_continue_button}
              </button>
            </div>
          )}

          {step === 'drill3' && (
            <div className="escalation-shell" style={{ margin: 0 }}>
              <StepLabel strings={strings} step={step} />
              <div className="escalation-header-row" style={{ padding: 0, marginBottom: '12px' }}>
                <h2 className="escalation-title">{strings.drill3_header}</h2>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill3_notify_label}</label>
                <select className="escalation-select" value={notifyGroup} onChange={(e) => setNotifyGroup(e.target.value)}>
                  <option value="" disabled>-- Select Group --</option>
                  {drill.options.notify.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="escalation-btn-primary"
                disabled={busy || !notifyGroup}
                onClick={handleDrill3}
              >
                {strings.drill3_continue_button}
              </button>
            </div>
          )}

          {step === 'drill4' && (
            <div className="escalation-shell" style={{ margin: 0 }}>
              <StepLabel strings={strings} step={step} />
              <div className="escalation-header-row" style={{ padding: 0, marginBottom: '4px' }}>
                <h2 className="escalation-title">{strings.drill4_header}</h2>
              </div>
              <p className="corp-card-body" style={{ padding: 0 }}>{drill.drills.escalation_brief}</p>
              <div className="escalation-row" style={{ padding: 0, marginTop: '12px' }}>
                <div className="escalation-field" style={{ padding: 0 }}>
                  <label className="escalation-label">{strings.drill4_impact_label}</label>
                  <select className="escalation-select" value={impact} onChange={(e) => setImpact(e.target.value)}>
                    {drill.options.impact.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="escalation-field" style={{ padding: 0 }}>
                  <label className="escalation-label">{strings.drill4_urgency_label}</label>
                  <select className="escalation-select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                    {drill.options.urgency.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill4_priority_label}</label>
                <div className="escalation-priority-readout">{priority || strings.drill2_priority_placeholder}</div>
              </div>
              <button type="button" className="escalation-btn-primary" disabled={busy} onClick={handleDrill4}>
                {strings.drill4_continue_button}
              </button>
            </div>
          )}

          {step === 'drill5' && (
            <div className="escalation-shell" style={{ margin: 0 }}>
              <StepLabel strings={strings} step={step} />
              <div className="escalation-header-row" style={{ padding: 0, marginBottom: '4px' }}>
                <h2 className="escalation-title">{strings.drill5_header}</h2>
              </div>
              <p className="corp-card-body" style={{ padding: 0 }}>{strings.drill5_intro}</p>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill5_description_label}</label>
                <textarea
                  className="escalation-textarea"
                  style={{ minHeight: '90px' }}
                  placeholder={strings.drill5_description_placeholder}
                  value={worklogDescription}
                  onChange={(e) => setWorklogDescription(e.target.value)}
                />
              </div>
              <div className="escalation-row" style={{ padding: 0 }}>
                <div className="escalation-field" style={{ padding: 0 }}>
                  <label className="escalation-label">{strings.drill5_time_label}</label>
                  <input
                    type="number"
                    min="0"
                    max="600"
                    className="escalation-input"
                    value={worklogMinutes}
                    onChange={(e) => setWorklogMinutes(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="escalation-field" style={{ padding: 0, display: 'flex', alignItems: 'center', gap: '8px', marginTop: '22px' }}>
                  <input
                    type="checkbox"
                    id="first-response"
                    checked={firstResponse}
                    onChange={(e) => setFirstResponse(e.target.checked)}
                  />
                  <label htmlFor="first-response" className="escalation-label" style={{ margin: 0 }}>
                    {strings.drill5_first_response_label}
                  </label>
                </div>
              </div>
              <button
                type="button"
                className="escalation-btn-primary"
                disabled={busy || !worklogDescription.trim()}
                onClick={handleDrill5}
              >
                {strings.drill5_continue_button}
              </button>
            </div>
          )}

          {step === 'drill6' && (
            <div className="escalation-shell" style={{ margin: 0 }}>
              <StepLabel strings={strings} step={step} />
              <div className="escalation-header-row" style={{ padding: 0, marginBottom: '12px' }}>
                <h2 className="escalation-title">{strings.drill6_header}</h2>
              </div>
              <div className="escalation-row" style={{ padding: 0 }}>
                <div className="escalation-field" style={{ padding: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="fcr" checked={fcr} onChange={(e) => setFcr(e.target.checked)} />
                  <label htmlFor="fcr" className="escalation-label" style={{ margin: 0 }}>{strings.drill6_fcr_label}</label>
                </div>
                <div className="escalation-field" style={{ padding: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="ack" checked={requesterAck} onChange={(e) => setRequesterAck(e.target.checked)} />
                  <label htmlFor="ack" className="escalation-label" style={{ margin: 0 }}>{strings.drill6_ack_label}</label>
                </div>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill6_closure_code_label}</label>
                <select className="escalation-select" value={closureCode} onChange={(e) => setClosureCode(e.target.value)}>
                  <option value="" disabled>-- Select Closure Code --</option>
                  {drill.options.closure.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="escalation-field" style={{ padding: 0 }}>
                <label className="escalation-label">{strings.drill6_comments_label}</label>
                <textarea
                  className="escalation-textarea"
                  style={{ minHeight: '90px' }}
                  placeholder={strings.drill6_comments_placeholder}
                  value={closureComments}
                  onChange={(e) => setClosureComments(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="escalation-btn-primary"
                disabled={busy || !closureCode}
                onClick={handleDrill6}
              >
                {strings.drill6_submit_button}
              </button>
            </div>
          )}

          {step === 'summary' && summary && (
            <div className="corp-card">
              <span className="corp-badge corp-badge-resolved">{strings.summary_header}</span>
              <p className="corp-card-title">{drill.title}</p>
              <p className="corp-card-body">{strings.summary_intro}</p>
              <div className="corp-panel" style={{ padding: '12px 16px' }}>
                {summary.events.map((e, i) => (
                  <div className="corp-log-entry" key={i}>
                    <p className="corp-log-title">{eventLabel(e)}</p>
                    <p className="corp-log-outcome">{eventDetail(e)}</p>
                  </div>
                ))}
              </div>
              <button type="button" className="escalation-btn-primary" onClick={gotoDepot}>
                {strings.summary_return_button}
              </button>
            </div>
          )}
        </div>
      </div>
    </Stage>
  );
}

function eventLabel(e) {
  switch (e.type) {
    case 'CREATED': return 'Ticket raised';
    case 'PRIORITY_CHANGED': return 'Priority set';
    case 'NOTIFY_SET': return 'Routed';
    case 'WORKLOG': return 'Work Log added';
    case 'CLOSED': return 'Ticket closed';
    default: return e.type;
  }
}

function eventDetail(e) {
  const d = e.detail;
  switch (e.type) {
    case 'CREATED': return `${d.category} — ${d.title}`;
    case 'PRIORITY_CHANGED': return `${d.impact} impact, ${d.urgency} urgency → ${d.priority} priority`;
    case 'NOTIFY_SET': return d.notify_group;
    case 'WORKLOG': return `${d.description} (${d.time_spent_minutes} min${d.first_response ? ', first response' : ''})`;
    case 'CLOSED': return `${d.closure_code} — ${d.closure_comments}`;
    default: return '';
  }
}
