import React, { useEffect, useState, useCallback } from 'react';
import { useGame } from '../state/machine';
import { useStrings } from '../state/strings';
import { fetchDepot, fetchFolder, getLang, setLang } from '../state/api';
import { isMuted, setMuted } from '../state/audio';
import Stage from '../components/Stage';
import RotateGate, { usePortrait } from '../components/RotateGate';
import BeginGate from '../components/BeginGate';
import { FolderIcon, FolderOpenIcon, FolderLockIcon, ArchiveIcon, ClipboardCheckIcon, LockIcon } from '../components/icons';

const EMPLOYEE_ID_KEY = 'quietfloor:employeeId';

// Beyond this many open+fully-reviewed dossiers, the oldest ones move off the
// visible shelf into the "Past weeks" drawer. Sealed and still-active dossiers
// are never archived — only finished business piles up. Keeps the shelf a
// single glance regardless of how many topics get added week over week.
const SHELF_CAP = 6;

function weeklyBhauLine(lines) {
  if (!lines || lines.length === 0) return '';
  const weekBucket = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return lines[weekBucket % lines.length];
}

function splitShelfAndArchive(folders) {
  const activeOrSealed = [];
  const reviewedOpen = [];
  folders.forEach((f) => {
    const done = f.state === 'OPEN' && f.progress.total > 0 && f.progress.reviewed >= f.progress.total;
    if (done) reviewedOpen.push(f);
    else activeOrSealed.push(f);
  });
  const shelfBudget = Math.max(0, SHELF_CAP - activeOrSealed.length);
  return {
    shelf: [...activeOrSealed, ...reviewedOpen.slice(0, shelfBudget)],
    archive: reviewedOpen.slice(shelfBudget),
  };
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
    <div className="depot-signin">
      <p className="depot-eyebrow">{strings.depot_eyebrow}</p>
      <h1 className="signin-title">{strings.app_title}</h1>
      <p className="bhau-line signin-tagline">{strings.app_tagline}</p>

      <div className="duty-slip depot-signin-slip">
        <span className="duty-slip-pin" aria-hidden="true" />
        <label htmlFor="emt-id" className="duty-slip-label">
          {strings.roll_number_label}
        </label>
        <input
          id="emt-id"
          type="text"
          maxLength={12}
          placeholder={strings.roll_number_placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <button type="button" className="btn btn-primary" onClick={handleSubmit}>
          {strings.emt_id_submit_button}
        </button>
      </div>
    </div>
  );
}

// Kabir's model: exactly one primary surface, and tonight's objective is
// always the single biggest thing on it — four states, one clear action.
function ObjectiveCard({ call, strings, onTakeCall, onReopenPending, onReadResolved }) {
  if (!call) {
    return (
      <div className="objective-card objective-none">
        <p className="objective-none-line1">{strings.objective_none_line1}</p>
        <p className="objective-none-line2">{strings.objective_none_line2}</p>
      </div>
    );
  }

  if (call.status === 'INCOMING') {
    return (
      <div className="objective-card objective-incoming">
        <p className="objective-label">{strings.objective_incoming_label}</p>
        <p className="objective-title">{call.title}</p>
        <button type="button" className="btn btn-primary objective-go" onClick={() => onTakeCall(call.case_id)}>
          {strings.objective_incoming_button}
        </button>
      </div>
    );
  }

  if (call.status === 'PENDING') {
    return (
      <div className="objective-card objective-pending" onClick={() => onReopenPending(call.case_id)}>
        <span className="depot-stamp depot-stamp-pending">{strings.depot_pending_label}</span>
        <LockIcon className="objective-lock-icon" size={22} />
        <p className="objective-title">{call.title}</p>
        <p className="objective-body">{strings.objective_pending_text}</p>
      </div>
    );
  }

  // RESOLVED
  return (
    <div className="objective-card objective-resolved">
      <span className="depot-stamp depot-stamp-resolved">{strings.depot_resolved_label}</span>
      <p className="objective-title">{call.title}</p>
      <p className="objective-body">{strings.objective_resolved_text}</p>
      <button type="button" className="btn btn-primary" onClick={() => onReadResolved(call.case_id)}>
        {strings.objective_resolved_button}
      </button>
    </div>
  );
}

function DossierSpine({ folder, strings, expanded, onToggle }) {
  const sealed = folder.state === 'SEALED';
  const reviewed = folder.state === 'OPEN' && folder.progress.total > 0 && folder.progress.reviewed >= folder.progress.total;
  return (
    <button
      type="button"
      className={`dossier-spine${sealed ? ' sealed' : ' open'}${reviewed ? ' reviewed' : ''}${expanded ? ' expanded' : ''}`}
      disabled={sealed}
      title={sealed ? strings.folder_sealed_tooltip : undefined}
      onClick={() => onToggle(folder.topic_id)}
    >
      <span className="dossier-tab" aria-hidden="true" />
      {sealed ? (
        <>
          <FolderLockIcon className="dossier-icon" size={26} />
          <span className="dossier-redacted" aria-hidden="true" />
          <span className="dossier-sealed-note">{strings.dossier_sealed_label}</span>
        </>
      ) : (
        <>
          {reviewed ? <FolderOpenIcon className="dossier-icon" size={26} /> : <FolderIcon className="dossier-icon" size={26} />}
          <span className="dossier-title">
            {folder.title}
            {reviewed && <span className="dossier-tick">{strings.dossier_reviewed_tick}</span>}
          </span>
        </>
      )}
    </button>
  );
}

// The dossier "opens in place" (Kabir) — a panel that expands within the same
// Depot screen instead of navigating to a sub-page.
function DossierFilePanel({ topicId, roll, strings, onOpenCase, onClose }) {
  const [folder, setFolder] = useState(null);

  useEffect(() => {
    setFolder(null);
    fetchFolder(topicId, roll).then(setFolder);
  }, [topicId, roll]);

  return (
    <div className="dossier-file-panel">
      <button type="button" className="btn btn-ghost dossier-close" onClick={onClose}>
        {strings.dossier_open_close}
      </button>
      {!folder ? (
        <p className="dossier-loading">{strings.loading_state}</p>
      ) : (
        <div className="dossier-case-list">
          {folder.cases.map((c) => (
            <button
              type="button"
              key={c.id}
              className="depot-folder-case"
              onClick={() => onOpenCase(c.id, c.reviewed)}
            >
              <span>{c.title}</span>
              {c.label && <span className="variant-badge">{strings.followup_stamp}</span>}
              {c.reviewed && <span className="handed-over">{strings.dossier_reviewed_tick}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchiveDrawer({ folders, strings, expandedTopic, onToggle }) {
  return (
    <div className="depot-drawer-panel">
      <p className="depot-drawer-heading">{strings.archive_drawer_tab}</p>
      {folders.length === 0 ? (
        <p className="depot-drawer-empty">{strings.archive_drawer_empty}</p>
      ) : (
        <div className="dossier-shelf archive-shelf">
          {folders.map((f) => (
            <DossierSpine
              key={f.topic_id}
              folder={f}
              strings={strings}
              expanded={expandedTopic === f.topic_id}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftLogDrawer({ depot, strings }) {
  return (
    <div className="depot-drawer-panel">
      <p className="depot-drawer-heading">{strings.shift_log_header}</p>
      {depot.log.length === 0 ? (
        <p className="depot-drawer-empty">{strings.shift_log_empty}</p>
      ) : (
        <div className="shift-log">
          {depot.log.map((entry) => (
            <div className="shift-log-entry" key={`${entry.case_id}`}>
              <p className="shift-log-title">{entry.title}</p>
              <p className="shift-log-choice">You chose {entry.option_chosen}</p>
              {entry.justification && <p className="shift-log-justification">"{entry.justification}"</p>}
              <p className="shift-log-outcome">{entry.outcome_line}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BhauCard({ strings, bhauLine }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bhau-card${open ? ' open' : ''}`} onClick={() => setOpen((v) => !v)}>
      <span className="bhau-card-pin" aria-hidden="true" />
      <span className="bhau-card-label">{strings.bhau_card_label}</span>
      {open && (
        <>
          <p className="bhau-card-bio">{strings.bhau_card_bio}</p>
          {bhauLine && <p className="bhau-line depot-bhau-note">{bhauLine}</p>}
        </>
      )}
    </div>
  );
}

function DepotHome({ depot, strings, roll, onTakeCall, onReopenPending, onReadResolved, onOpenCase, onSignOut, muted, onToggleMute, lang, onToggleLang }) {
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [drawer, setDrawer] = useState(null); // null | 'log' | 'archive'

  const { shelf, archive } = splitShelfAndArchive(depot.folders);
  const bhauLine = weeklyBhauLine(strings.bhau_depot_lines);

  function toggleDossier(topicId) {
    setExpandedTopic((cur) => (cur === topicId ? null : topicId));
    setDrawer(null);
  }

  function toggleDrawer(name) {
    setDrawer((cur) => (cur === name ? null : name));
    setExpandedTopic(null);
  }

  return (
    <>
      <p className="depot-eyebrow">{strings.depot_eyebrow}</p>
      <button type="button" className="btn btn-ghost not-you-link" onClick={onSignOut}>
        {strings.not_you_link}
      </button>
      <button type="button" className="btn btn-ghost mute-toggle" onClick={onToggleMute}>
        {muted ? strings.mute_off_icon : strings.mute_on_icon}
      </button>
      <button type="button" className="btn btn-ghost lang-toggle" onClick={onToggleLang}>
        {lang === 'mr' ? 'मराठी' : 'EN'}
      </button>

      <div className="objective-slot">
        <ObjectiveCard
          call={depot.current_call}
          strings={strings}
          onTakeCall={onTakeCall}
          onReopenPending={onReopenPending}
          onReadResolved={onReadResolved}
        />
      </div>

      <div className="dossier-shelf">
        {shelf.map((f) => (
          <DossierSpine
            key={f.topic_id}
            folder={f}
            strings={strings}
            expanded={expandedTopic === f.topic_id}
            onToggle={toggleDossier}
          />
        ))}
      </div>

      {expandedTopic && (
        <DossierFilePanel
          topicId={expandedTopic}
          roll={roll}
          strings={strings}
          onOpenCase={onOpenCase}
          onClose={() => setExpandedTopic(null)}
        />
      )}

      <div className="depot-drawer-tabs">
        <button type="button" className="depot-drawer-tab" onClick={() => toggleDrawer('log')}>
          <ClipboardCheckIcon size={16} />
          {strings.shift_log_drawer_tab}
        </button>
        <button type="button" className="depot-drawer-tab" onClick={() => toggleDrawer('archive')}>
          <ArchiveIcon size={16} />
          {strings.archive_drawer_tab}
        </button>
      </div>

      {drawer === 'log' && <ShiftLogDrawer depot={depot} strings={strings} />}
      {drawer === 'archive' && (
        <ArchiveDrawer folders={archive} strings={strings} expandedTopic={expandedTopic} onToggle={toggleDossier} />
      )}

      <BhauCard strings={strings} bhauLine={bhauLine} />
    </>
  );
}

export default function Depot() {
  const { state, setRoll, startVN, gotoRevealDirect } = useGame();
  const strings = useStrings();
  const isPortrait = usePortrait();
  // If we're arriving back from the VN (still fullscreen from that gesture),
  // don't make the student tap through the gate again — only a real fresh
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

  // Employee ID persists across visits (§1.1) — restore it once on mount.
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
      <div className="depot-shell">
        {!signedIn ? (
          <SignIn strings={strings} onSignedIn={() => setSignedIn(true)} />
        ) : !depot ? (
          <p className="depot-loading">{strings.loading_state}</p>
        ) : (
          <DepotHome
            depot={depot}
            strings={strings}
            roll={state.roll}
            onTakeCall={(caseId) => startVN(caseId)}
            onReopenPending={(caseId) => startVN(caseId, { startAtHalt: true })}
            onReadResolved={(caseId) => gotoRevealDirect(state.roll, caseId)}
            onOpenCase={(caseId, reviewed) => {
              if (reviewed) gotoRevealDirect(state.roll, caseId);
              else startVN(caseId);
            }}
            onSignOut={handleNotYou}
            muted={muted}
            onToggleMute={toggleMute}
            lang={lang}
            onToggleLang={toggleLang}
          />
        )}
      </div>
    </Stage>
  );
}
