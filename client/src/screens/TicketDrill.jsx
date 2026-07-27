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

const EVENT_FOR_TEACHES = {
  category: 'CREATED',
  priority: 'PRIORITY_CHANGED',
  notify: 'NOTIFY_SET',
  worklog: 'WORKLOG',
  closure: 'CLOSED',
};

const TEACHES_LABEL = {
  category: 'Ticket Category',
  priority: 'Impact & Urgency → Priority',
  notify: 'Routing / Notify',
  worklog: 'Work Log',
  closure: 'Closure Code',
};

function SceneImage({ file, alt }) {
  const [errored, setErrored] = useState(false);
  if (errored) return null;
  return (
    <img
      className="scene-image"
      src={`/img/${file}`}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}

function ErrorBanner({ error, dark }) {
  if (!error) return null;
  return dark ? (
    <p className="scene-error">{error}</p>
  ) : (
    <div className="corp-card" style={{ borderColor: '#e0483e' }}>
      <p className="corp-card-body" style={{ margin: 0, color: '#e0483e' }}>{error}</p>
    </div>
  );
}

export default function TicketDrill() {
  const { state, gotoDepot } = useGame();
  const { roll, caseId, ticketId: resumeTicketId } = state;
  const strings = useStrings();

  const [drill, setDrill] = useState(null); // { title, teaches, scene, drills, concept, options }
  const [step, setStep] = useState(null); // 'scene' | 'drill' | 'concept'
  const [ticket, setTicket] = useState(null); // { id } once created
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // category fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  // priority fields
  const [impact, setImpact] = useState('');
  const [urgency, setUrgency] = useState('');
  // notify field
  const [notifyGroup, setNotifyGroup] = useState('');
  // worklog fields
  const [worklogDescription, setWorklogDescription] = useState('');
  const [worklogMinutes, setWorklogMinutes] = useState(15);
  const [firstResponse, setFirstResponse] = useState(false);
  // closure fields
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
      setDescription(d.drills.description_seed || '');
      setWorklogDescription(d.drills.worklog_seed || '');
      setClosureComments(d.drills.closure_comment_seed || '');

      if (resumeTicketId) {
        const { ticket: t, events } = await fetchTicket(resumeTicketId);
        if (cancelled) return;
        setTicket({ id: t.id });
        const alreadyTaught = events.some((e) => e.type === EVENT_FOR_TEACHES[d.teaches]);
        setStep(alreadyTaught ? 'concept' : 'drill');
      } else {
        setStep('scene');
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
        <div className="scene-stage">
          <p className="scene-line">{strings.loading_state}</p>
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

  // Scene -> Drill. If this scenario's one interactive step isn't ticket
  // creation itself, the ticket is bootstrapped silently here using the
  // scenario's preset title/category/description — the trainee never sees
  // this as a step, only the one mechanic this scenario teaches.
  function handleSceneContinue() {
    if (drill.teaches === 'category') {
      setStep('drill');
      return;
    }
    guard(async () => {
      const { id } = await createTicket({
        roll_number: roll,
        case_id: caseId,
        title: drill.drills.title,
        category: drill.drills.category,
        description: drill.drills.description_seed,
      });
      setTicket({ id });
      setStep('drill');
    });
  }

  function handleCategorySubmit() {
    guard(async () => {
      const { id } = await createTicket({
        roll_number: roll,
        case_id: caseId,
        title,
        category,
        description,
      });
      setTicket({ id });
      setStep('concept');
    });
  }

  function handlePrioritySubmit() {
    guard(async () => {
      await setTicketPriority(ticket.id, impact, urgency);
      setStep('concept');
    });
  }

  function handleNotifySubmit() {
    guard(async () => {
      await setTicketNotify(ticket.id, notifyGroup);
      setStep('concept');
    });
  }

  function handleWorklogSubmit() {
    guard(async () => {
      await addTicketWorklog(ticket.id, worklogDescription, worklogMinutes, firstResponse);
      setStep('concept');
    });
  }

  function handleClosureSubmit() {
    guard(async () => {
      await closeTicket(ticket.id, { fcr, requesterAck, closureCode, closureComments });
      setStep('concept');
    });
  }

  // Scene and concept are the game-feel narrative beats — full dark stage,
  // cinematic images, display type. The drill step is the real tool: a
  // light corporate form island dropped into the same dark stage.
  if (step === 'scene') {
    return (
      <Stage>
        <div className="scene-stage">
          <div className="scene-content">
            <ErrorBanner error={error} dark />
            <p className="scene-kicker">{strings.scene_header}</p>
            <h1 className="scene-title">{drill.title}</h1>
            {drill.scene.images.map((file) => (
              <SceneImage key={file} file={file} alt={drill.title} />
            ))}
            {drill.scene.lines.map((line, i) => (
              <p key={i} className="scene-line">{line}</p>
            ))}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={handleSceneContinue}>
              {strings.scene_continue_button}
            </button>
          </div>
        </div>
      </Stage>
    );
  }

  if (step === 'concept') {
    return (
      <Stage>
        <div className="scene-stage">
          <div className="scene-content">
            <p className="scene-kicker">{strings.concept_badge}</p>
            <p className="scene-subkicker">{TEACHES_LABEL[drill.teaches]}</p>
            <h1 className="scene-title">{drill.title}</h1>
            <p className="scene-line" style={{ color: 'var(--paper)', fontWeight: 600 }}>{strings.concept_lead_in}</p>
            <p className="concept-line">{drill.concept}</p>
            <button type="button" className="btn btn-primary" onClick={gotoDepot}>
              {strings.concept_return_button}
            </button>
          </div>
        </div>
      </Stage>
    );
  }

  return (
    <Stage>
      <div className="scene-stage">
        <div className="scene-content">
          <ErrorBanner error={error} />

          {drill.teaches === 'category' && (
            <div className="escalation-shell">
              <div className="escalation-header-row" style={{ padding: '18px 20px 12px' }}>
                <h2 className="escalation-title">{drill.title}</h2>
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill1_title_label}</label>
                <input
                  type="text"
                  className="escalation-input"
                  placeholder={strings.drill1_title_placeholder}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill1_category_label}</label>
                <select className="escalation-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="" disabled>-- Select Category --</option>
                  {drill.options.category.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill1_description_label}</label>
                <textarea
                  className="escalation-textarea"
                  style={{ minHeight: '90px' }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="escalation-actions">
                <button
                  type="button"
                  className="escalation-btn-primary"
                  disabled={busy || !title.trim() || !category}
                  onClick={handleCategorySubmit}
                >
                  {strings.drill1_continue_button}
                </button>
              </div>
            </div>
          )}

          {drill.teaches === 'priority' && (
            <div className="escalation-shell">
              <div className="escalation-header-row" style={{ padding: '18px 20px 12px' }}>
                <h2 className="escalation-title">{drill.title}</h2>
              </div>
              <div className="escalation-row">
                <div className="escalation-field">
                  <label className="escalation-label">{strings.drill2_impact_label}</label>
                  <select className="escalation-select" value={impact} onChange={(e) => setImpact(e.target.value)}>
                    <option value="" disabled>-- Select --</option>
                    {drill.options.impact.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="escalation-field">
                  <label className="escalation-label">{strings.drill2_urgency_label}</label>
                  <select className="escalation-select" value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                    <option value="" disabled>-- Select --</option>
                    {drill.options.urgency.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill2_priority_label}</label>
                <div className="escalation-priority-readout">{priority || strings.drill2_priority_placeholder}</div>
              </div>
              <div className="escalation-actions">
                <button
                  type="button"
                  className="escalation-btn-primary"
                  disabled={busy || !impact || !urgency}
                  onClick={handlePrioritySubmit}
                >
                  {strings.drill2_continue_button}
                </button>
              </div>
            </div>
          )}

          {drill.teaches === 'notify' && (
            <div className="escalation-shell">
              <div className="escalation-header-row" style={{ padding: '18px 20px 12px' }}>
                <h2 className="escalation-title">{drill.title}</h2>
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill3_notify_label}</label>
                <select className="escalation-select" value={notifyGroup} onChange={(e) => setNotifyGroup(e.target.value)}>
                  <option value="" disabled>-- Select Group --</option>
                  {drill.options.notify.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="escalation-actions">
                <button
                  type="button"
                  className="escalation-btn-primary"
                  disabled={busy || !notifyGroup}
                  onClick={handleNotifySubmit}
                >
                  {strings.drill3_continue_button}
                </button>
              </div>
            </div>
          )}

          {drill.teaches === 'worklog' && (
            <div className="escalation-shell">
              <div className="escalation-header-row" style={{ padding: '18px 20px 4px' }}>
                <h2 className="escalation-title">{drill.title}</h2>
              </div>
              <p className="corp-card-body" style={{ padding: '0 20px' }}>{strings.drill5_intro}</p>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill5_description_label}</label>
                <textarea
                  className="escalation-textarea"
                  style={{ minHeight: '90px' }}
                  placeholder={strings.drill5_description_placeholder}
                  value={worklogDescription}
                  onChange={(e) => setWorklogDescription(e.target.value)}
                />
              </div>
              <div className="escalation-row">
                <div className="escalation-field">
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
                <div className="escalation-field escalation-checkbox-field">
                  <label className="escalation-checkbox-label">
                    <input
                      type="checkbox"
                      checked={firstResponse}
                      onChange={(e) => setFirstResponse(e.target.checked)}
                    />
                    <span>{strings.drill5_first_response_label}</span>
                  </label>
                </div>
              </div>
              <div className="escalation-actions">
                <button
                  type="button"
                  className="escalation-btn-primary"
                  disabled={busy || !worklogDescription.trim()}
                  onClick={handleWorklogSubmit}
                >
                  {strings.drill5_continue_button}
                </button>
              </div>
            </div>
          )}

          {drill.teaches === 'closure' && (
            <div className="escalation-shell">
              <div className="escalation-header-row" style={{ padding: '18px 20px 12px' }}>
                <h2 className="escalation-title">{drill.title}</h2>
              </div>
              <div className="escalation-row">
                <div className="escalation-field escalation-checkbox-field">
                  <label className="escalation-checkbox-label">
                    <input type="checkbox" checked={fcr} onChange={(e) => setFcr(e.target.checked)} />
                    <span>{strings.drill6_fcr_label}</span>
                  </label>
                </div>
                <div className="escalation-field escalation-checkbox-field">
                  <label className="escalation-checkbox-label">
                    <input type="checkbox" checked={requesterAck} onChange={(e) => setRequesterAck(e.target.checked)} />
                    <span>{strings.drill6_ack_label}</span>
                  </label>
                </div>
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill6_closure_code_label}</label>
                <select className="escalation-select" value={closureCode} onChange={(e) => setClosureCode(e.target.value)}>
                  <option value="" disabled>-- Select Closure Code --</option>
                  {drill.options.closure.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="escalation-field">
                <label className="escalation-label">{strings.drill6_comments_label}</label>
                <textarea
                  className="escalation-textarea"
                  style={{ minHeight: '90px' }}
                  placeholder={strings.drill6_comments_placeholder}
                  value={closureComments}
                  onChange={(e) => setClosureComments(e.target.value)}
                />
              </div>
              <div className="escalation-actions">
                <button
                  type="button"
                  className="escalation-btn-primary"
                  disabled={busy || !closureCode}
                  onClick={handleClosureSubmit}
                >
                  {strings.drill6_submit_button}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Stage>
  );
}
