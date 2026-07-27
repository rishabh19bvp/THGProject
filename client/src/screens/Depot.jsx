import React, { useEffect, useState, useCallback } from 'react';
import { useGame } from '../state/machine';
import { useStrings } from '../state/strings';
import { fetchDepot } from '../state/api';
import { isMuted, setMuted } from '../state/audio';
import Stage from '../components/Stage';
import RotateGate, { usePortrait } from '../components/RotateGate';
import BeginGate from '../components/BeginGate';

const EMPLOYEE_ID_KEY = 'quietfloor:employeeId';

function weeklyMentorLine(lines) {
  if (!lines || lines.length === 0) return '';
  const weekBucket = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return lines[weekBucket % lines.length];
}

function SignIn({ strings, onSignedIn }) {
  const { setRoll } = useGame();
  const [draft, setDraft] = useState('');

  function handleSubmit() {
    const trimmed = draft.trim();
    if (trimmed.length < 1 || trimmed.length > 12) return;
    localStorage.setItem(EMPLOYEE_ID_KEY, trimmed);
    setRoll(trimmed);
    onSignedIn(trimmed);
  }

  return (
    <div className="corp-shell">
      <div className="escalation-topbar">
        <span className="escalation-topbar-icon">SD</span>
        <span className="escalation-topbar-title">Service Desk</span>
      </div>
      <div className="corp-signin-wrap">
        <div className="corp-signin-card">
          <h1 className="corp-signin-title">{strings.app_title}</h1>
          <p className="corp-signin-tagline">{strings.app_tagline}</p>
          <label htmlFor="employee-id" className="escalation-label">
            {strings.roll_number_label}
          </label>
          <input
            id="employee-id"
            type="text"
            className="escalation-input"
            style={{ marginBottom: '16px' }}
            maxLength={12}
            placeholder={strings.roll_number_placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <button type="button" className="escalation-btn-primary" style={{ width: '100%' }} onClick={handleSubmit}>
            {strings.emt_id_submit_button}
          </button>
        </div>
      </div>
    </div>
  );
}

// Each scenario teaches exactly one SDP mechanic — shown as a small
// "Lesson N: teaches X" kicker so the curriculum order is visible even
// though every scenario stays playable in any order, any number of times.
const TEACHES_LABEL = {
  category: 'Ticket Category',
  priority: 'Impact & Urgency → Priority',
  notify: 'Routing / Notify',
  worklog: 'Work Log',
  closure: 'Closure Code',
};

function LessonKicker({ c }) {
  return (
    <p className="corp-lesson-kicker">
      Lesson {c.case_id} — Teaches: {TEACHES_LABEL[c.teaches] || c.teaches}
    </p>
  );
}

function CaseCard({ c, onPlay, onResume }) {
  if (c.status === 'OPEN') {
    return (
      <div className="corp-card">
        <span className="corp-badge corp-badge-pending">Ticket open</span>
        <LessonKicker c={c} />
        <p className="corp-card-title">{c.title}</p>
        <button type="button" className="escalation-btn-primary" onClick={() => onResume(c.case_id, c.ticket_id)}>
          Resume
        </button>
      </div>
    );
  }
  return (
    <div className="corp-card">
      <LessonKicker c={c} />
      <p className="corp-card-title">{c.title}</p>
      <button type="button" className="escalation-btn-primary" onClick={() => onPlay(c.case_id)}>
        Play
      </button>
    </div>
  );
}

function CompletedCard({ c, onPlay }) {
  return (
    <div className="corp-card">
      <span className="corp-badge corp-badge-resolved">Completed</span>
      <LessonKicker c={c} />
      <p className="corp-card-title">{c.title}</p>
      <button type="button" className="escalation-btn-secondary" onClick={() => onPlay(c.case_id)}>
        Play again
      </button>
    </div>
  );
}

function HelpCard({ strings, mentorLine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="corp-help-card" onClick={() => setOpen((v) => !v)}>
      <span className="corp-help-label">{strings.bhau_card_label}</span>
      {open && (
        <>
          <p className="corp-help-bio">{strings.bhau_card_bio}</p>
          {mentorLine && <p className="corp-help-line">{mentorLine}</p>}
        </>
      )}
    </div>
  );
}

function DepotHome({ depot, strings, onPlay, onResume, onSignOut, muted, onToggleMute }) {
  const mentorLine = weeklyMentorLine(strings.bhau_depot_lines);
  const available = depot.cases.filter((c) => c.status !== 'COMPLETED');
  const completed = depot.cases.filter((c) => c.status === 'COMPLETED');

  return (
    <>
      <div className="escalation-topbar">
        <span className="escalation-topbar-icon">SD</span>
        <span className="escalation-topbar-title">Service Desk</span>
        <div className="corp-topbar-right">
          <button type="button" className="corp-icon-btn" onClick={onSignOut}>
            {strings.not_you_link}
          </button>
          <button type="button" className="corp-icon-btn" onClick={onToggleMute}>
            {muted ? strings.mute_off_icon : strings.mute_on_icon}
          </button>
        </div>
      </div>

      <div className="corp-container">
        <p className="corp-matrix-heading" style={{ marginTop: 0 }}>Cases</p>
        {available.length === 0 ? (
          <p className="corp-empty">Nothing left to play — see Completed below.</p>
        ) : (
          available.map((c) => <CaseCard key={c.case_id} c={c} onPlay={onPlay} onResume={onResume} />)
        )}

        {completed.length > 0 && (
          <>
            <p className="corp-matrix-heading">Completed</p>
            {completed.map((c) => (
              <CompletedCard key={c.case_id} c={c} onPlay={onPlay} />
            ))}
          </>
        )}

        <HelpCard strings={strings} mentorLine={mentorLine} />
      </div>
    </>
  );
}

export default function Depot() {
  const { state, setRoll, startDrill } = useGame();
  const strings = useStrings();
  const isPortrait = usePortrait();
  // If we're arriving back from a drill (still fullscreen from that gesture),
  // don't make the trainee tap through the gate again — only a real fresh
  // page load has no fullscreen element yet.
  const [began, setBegan] = useState(() => !!document.fullscreenElement);
  const [signedIn, setSignedIn] = useState(false);
  const [depot, setDepot] = useState(null);
  const [muted, setMutedState] = useState(isMuted());

  const refreshDepot = useCallback(() => {
    if (!state.roll) return;
    fetchDepot(state.roll).then(setDepot);
  }, [state.roll]);

  // Employee ID persists across visits — restore it once on mount.
  useEffect(() => {
    if (state.roll) {
      setSignedIn(true);
      return;
    }
    const persisted = localStorage.getItem(EMPLOYEE_ID_KEY);
    if (persisted) {
      setRoll(persisted);
      setSignedIn(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (signedIn && state.roll) refreshDepot();
  }, [signedIn, state.roll, refreshDepot]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  function handleNotYou() {
    localStorage.removeItem(EMPLOYEE_ID_KEY);
    setRoll('');
    setSignedIn(false);
    setDepot(null);
  }

  if (isPortrait) {
    return (
      <Stage>
        <RotateGate />
      </Stage>
    );
  }

  // Browsers never remember fullscreen/orientation-lock across a fresh load,
  // so this tap-to-enter gate runs every time, regardless of whether the
  // Employee ID is already persisted.
  if (!began) {
    return (
      <Stage>
        <BeginGate onBegin={() => setBegan(true)} />
      </Stage>
    );
  }

  return (
    <Stage>
      {!signedIn ? (
        <SignIn strings={strings} onSignedIn={() => setSignedIn(true)} />
      ) : !depot ? (
        <div className="corp-shell">
          <p className="corp-empty" style={{ padding: '32px' }}>{strings.loading_state}</p>
        </div>
      ) : (
        <div className="corp-shell">
          <DepotHome
            depot={depot}
            strings={strings}
            onPlay={(caseId) => startDrill(caseId)}
            onResume={(caseId, ticketId) => startDrill(caseId, { ticketId })}
            onSignOut={handleNotYou}
            muted={muted}
            onToggleMute={toggleMute}
          />
        </div>
      )}
    </Stage>
  );
}
