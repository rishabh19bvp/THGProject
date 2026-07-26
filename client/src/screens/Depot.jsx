import React, { useEffect, useState, useCallback } from 'react';
import { useGame } from '../state/machine';
import { useStrings } from '../state/strings';
import { fetchDepot, getLang, setLang } from '../state/api';
import { isMuted, setMuted } from '../state/audio';
import Stage from '../components/Stage';
import RotateGate, { usePortrait } from '../components/RotateGate';
import BeginGate from '../components/BeginGate';
import { ClipboardCheckIcon } from '../components/icons';

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

// No sequential unlock — every case is visible and playable in any order,
// any number of times. Status just tells the trainee where they left off.
function CaseCard({ c, onPlay, onResume }) {
  if (c.status === 'PENDING_LOG') {
    return (
      <div className="corp-card">
        <span className="corp-badge corp-badge-pending">Awaiting debrief</span>
        <p className="corp-card-title">{c.title}</p>
        <button type="button" className="escalation-btn-primary" onClick={() => onResume(c.case_id)}>
          Resume
        </button>
      </div>
    );
  }
  return (
    <div className="corp-card">
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
      <p className="corp-card-title">{c.title}</p>
      <button type="button" className="escalation-btn-secondary" onClick={() => onPlay(c.case_id)}>
        Play again
      </button>
    </div>
  );
}

function ShiftLogPanel({ depot, strings }) {
  return (
    <div className="corp-panel">
      <p className="corp-panel-heading">{strings.shift_log_header}</p>
      {depot.log.length === 0 ? (
        <p className="corp-empty">{strings.shift_log_empty}</p>
      ) : (
        depot.log.map((entry) => (
          <div className="corp-log-entry" key={entry.case_id}>
            <p className="corp-log-title">{entry.title}</p>
            <p className="corp-log-choice">You chose {entry.option_chosen}</p>
            {entry.justification && <p className="corp-log-justification">"{entry.justification}"</p>}
            <p className="corp-log-outcome">{entry.outcome_line}</p>
          </div>
        ))
      )}
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

function DepotHome({ depot, strings, onPlay, onResume, onSignOut, muted, onToggleMute, lang, onToggleLang }) {
  const [showLog, setShowLog] = useState(false);
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
          <button type="button" className="corp-icon-btn" onClick={onToggleLang}>
            {lang === 'mr' ? 'मराठी' : 'EN'}
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

        <div className="corp-drawer-tabs">
          <button type="button" className="corp-drawer-tab" onClick={() => setShowLog((v) => !v)}>
            <ClipboardCheckIcon size={16} />
            {strings.shift_log_drawer_tab}
          </button>
        </div>

        {showLog && <ShiftLogPanel depot={depot} strings={strings} />}

        <HelpCard strings={strings} mentorLine={mentorLine} />
      </div>
    </>
  );
}

export default function Depot() {
  const { state, setRoll, startVN, gotoRevealDirect } = useGame();
  const strings = useStrings();
  const isPortrait = usePortrait();
  // If we're arriving back from the VN (still fullscreen from that gesture),
  // don't make the trainee tap through the gate again — only a real fresh
  // page load has no fullscreen element yet.
  const [began, setBegan] = useState(() => !!document.fullscreenElement);
  const [signedIn, setSignedIn] = useState(false);
  const [depot, setDepot] = useState(null);
  const [muted, setMutedState] = useState(isMuted());
  const [lang, setLangState] = useState(getLang());

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

  // A full reload keeps this simple and correct: every fetch (strings, case,
  // vn-script, reveal) reads the new language straight off localStorage, so
  // there's no in-flight state to reconcile across a language flip.
  function toggleLang() {
    const next = lang === 'mr' ? 'en' : 'mr';
    setLang(next);
    setLangState(next);
    window.location.reload();
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
  // so this tap-to-enter gate runs every time, same as the VN — regardless
  // of whether the Employee ID is already persisted.
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
            onPlay={(caseId) => startVN(caseId)}
            onResume={(caseId) => gotoRevealDirect(state.roll, caseId)}
            onSignOut={handleNotYou}
            muted={muted}
            onToggleMute={toggleMute}
            lang={lang}
            onToggleLang={toggleLang}
          />
        </div>
      )}
    </Stage>
  );
}
