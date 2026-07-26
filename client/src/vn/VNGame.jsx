import React, { useEffect, useRef, useState } from 'react';
import { useStrings } from '../state/strings';
import { useGame } from '../state/machine';
import {
  fetchVnScript,
  fetchReveal,
  submitWithResilience,
  flushOutbox,
  hasOutboxEntry,
  postHaltRevisit,
} from '../state/api';
import { isMuted, setMuted } from '../state/audio';
import Stage from '../components/Stage';
import RotateGate, { usePortrait } from '../components/RotateGate';
import BeginGate from '../components/BeginGate';
import DialogueBox from './DialogueBox';
import Portrait from './Portrait';
import VNTimer from './VNTimer';
import ImageOrPlaceholder from '../components/ImageOrPlaceholder';
import StatusPanel from '../components/StatusPanel';

const DECISION_WINDOW_MS = 90000;
const ASSESSMENT_DEDUCTION_MS = 15000;
const PROBE_TIMER_MS = 60000;
// Corporate self-paced model: reveal unlocks the instant this trainee's own
// submission lands (no facilitator gate to wait on), so this only needs to
// bridge the brief gap between advancing to the halt beat and the
// fire-and-forget submit actually completing — not a real waiting period.
const HALT_POLL_MS = 2000;
const DONE_ID = '__vn_done__';
const OUTBOX_KEY = 'quietfloor:outbox';

export default function VNGame({ caseId, roll, startAtHalt, onExit }) {
  const strings = useStrings();
  const { gotoRevealDirect } = useGame();
  const isPortrait = usePortrait();
  // Arriving from the Depot, already fullscreen from that gesture — don't
  // re-prompt. Only a real fresh page load has no fullscreen element yet.
  const [began, setBegan] = useState(() => !!document.fullscreenElement);
  const [script, setScript] = useState(null);
  const [beatIndex, setBeatIndex] = useState(0);
  const [bg, setBg] = useState(null);
  const [assessmentsTaken, setAssessmentsTaken] = useState([]);
  const [assessmentResult, setAssessmentResult] = useState(null); // {label, result} | null
  const [selectedOption, setSelectedOption] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [decisionForced, setDecisionForced] = useState(false);
  const [probeDraft, setProbeDraft] = useState('');
  const [haltStep, setHaltStep] = useState(0);
  const [haltUnlocked, setHaltUnlocked] = useState(false);
  const [haltSavingChip, setHaltSavingChip] = useState(false);
  const [muted, setMutedState] = useState(isMuted());

  const timedSegmentRef = useRef({ started: false, deadline: null });
  const dispatchStartRef = useRef(null);
  const probeDeadlineRef = useRef(null);
  const commitInfoRef = useRef(null);
  const haltRevisitTrackedRef = useRef(false);
  // the scene bg in effect when the assessment menu was entered — assessment
  // results can borrow a closer-in shot (e.g. a dashboard close-up) and this
  // is what we restore to once that result is dismissed or another
  // assessment without its own image is picked.
  const sceneBgRef = useRef(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    flushOutbox();
    fetchVnScript(caseId, roll).then((data) => {
      setScript(data);
      let startIndex = 0;
      if (startAtHalt) {
        const haltIdx = data.beats.findIndex((b) => b.type === 'halt');
        if (haltIdx !== -1) startIndex = haltIdx;
      }
      setBeatIndex(startIndex);
      setBg(data.beats[startIndex] ? data.beats[startIndex].bg || null : null);
      dispatchStartRef.current = Date.now();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, roll]);


  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  const beat = script ? script.beats[beatIndex] : null;

  // §6.3 / classic Halt.jsx parity — track revisits and poll for teacher
  // unlock while the student is sitting on the cliffhanger beat. Declared
  // before any early return so hook order stays stable across renders.
  useEffect(() => {
    if (!beat || beat.type !== 'halt') return undefined;

    if (!haltRevisitTrackedRef.current) {
      haltRevisitTrackedRef.current = true;
      const revisitFlagKey = `quietfloor:haltSeenOnce:${roll}:${caseId}`;
      if (localStorage.getItem(revisitFlagKey)) {
        postHaltRevisit(roll, caseId);
      } else {
        localStorage.setItem(revisitFlagKey, '1');
      }
    }

    let cancelled = false;
    async function poll() {
      try {
        const data = await fetchReveal(caseId, roll);
        if (cancelled) return;
        if (!data.locked) {
          setHaltUnlocked(true);
        }
      } catch (e) {
        // silent — retried on next poll
      }
      await flushOutbox();
      if (!cancelled) setHaltSavingChip(hasOutboxEntry(roll, caseId));
    }
    poll();
    const interval = setInterval(poll, HALT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat && beat.type, caseId, roll]);

  if (!script) {
    return (
      <Stage>
        <div className="vn-loading">{strings.loading_state}</div>
      </Stage>
    );
  }

  function startTimedSegmentIfNeeded() {
    if (!timedSegmentRef.current.started) {
      timedSegmentRef.current = { started: true, deadline: Date.now() + DECISION_WINDOW_MS };
      forceRender((n) => n + 1);
    }
  }

  function advanceBeat() {
    setBg((prev) => (beat.bg ? beat.bg : prev));
    const next = beatIndex + 1;
    if (next >= script.beats.length) return;
    setBeatIndex(next);
    const nextBeat = script.beats[next];
    if (nextBeat.bg) setBg(nextBeat.bg);
    if (nextBeat.type === 'assessment_menu') {
      sceneBgRef.current = nextBeat.bg || bg;
    }
    if (nextBeat.type === 'assessment_menu' || nextBeat.type === 'decision') {
      startTimedSegmentIfNeeded();
    }
    if (nextBeat.type === 'probe') {
      probeDeadlineRef.current = Date.now() + PROBE_TIMER_MS;
      forceRender((n) => n + 1);
    }
  }

  function handleAssessmentPick(id) {
    if (id === DONE_ID) {
      setAssessmentResult(null);
      advanceBeat();
      return;
    }
    const opt = beat.options.find((o) => o.id === id);
    if (!opt) return;
    if (!assessmentsTaken.includes(id)) {
      setAssessmentsTaken((prev) => [...prev, id]);
      if (timedSegmentRef.current.started) {
        timedSegmentRef.current.deadline -= ASSESSMENT_DEDUCTION_MS;
      }
    }
    // an assessment can borrow a closer-in shot for its result (e.g. a
    // dashboard close-up); one without an image just keeps the scene's own bg.
    setBg(opt.image || sceneBgRef.current);
    setAssessmentResult({ result: opt.result });
  }

  function handleAssessmentResultAdvance() {
    setAssessmentResult(null);
    setBg(sceneBgRef.current);
  }

  function handleDecisionExpire() {
    setDecisionForced(true);
  }

  function commitOption(id) {
    const now = Date.now();
    const startedAt = timedSegmentRef.current.deadline - DECISION_WINDOW_MS;
    const timeToDecisionMs = Math.min(Math.max(now - startedAt, 0), DECISION_WINDOW_MS);
    commitInfoRef.current = { option: id, timeToDecisionMs };
    advanceBeat();
  }

  function handleDecisionChoice(id) {
    if (decisionForced) {
      commitOption(id);
      return;
    }
    if (!selectedOption) {
      setSelectedOption(id);
      setConfirming(true);
      return;
    }
  }

  function handleCommitConfirm(id) {
    if (id === 'cancel') {
      setSelectedOption(null);
      setConfirming(false);
      return;
    }
    commitOption(selectedOption);
  }

  async function submitProbe() {
    const payload = {
      roll_number: roll,
      case_id: caseId,
      assessments_taken: assessmentsTaken,
      option_chosen: commitInfoRef.current ? commitInfoRef.current.option : null,
      justification: probeDraft,
      time_to_decision_ms: commitInfoRef.current ? commitInfoRef.current.timeToDecisionMs : 0,
    };

    const items = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    items.push(payload);
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));

    function clearFromOutbox() {
      const remaining = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]').filter(
        (p) => !(p.roll_number === payload.roll_number && p.case_id === payload.case_id)
      );
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(remaining));
    }

    // practice cases resolve immediately — no halt gate, no anti-cheat layer
    // (phase2_design.md §1.2). There's no halt beat in the script at all for
    // these (see buildVnBeats), so we hand off straight to the Reveal screen.
    if (script.kind === 'practice') {
      submitWithResilience(payload).then((result) => {
        if (result.ok) clearFromOutbox();
      });
      gotoRevealDirect(roll, caseId);
      return;
    }

    advanceBeat();

    submitWithResilience(payload).then((result) => {
      if (result.ok) clearFromOutbox();
    });
  }

  function handleProbeExpire() {
    submitProbe();
  }

  const showTimer =
    timedSegmentRef.current.started &&
    (beat.type === 'assessment_menu' || beat.type === 'decision');
  const showProbeTimer = beat.type === 'probe';
  // beat.scene distinguishes actual scene-description narration from other
  // narration — status data only makes sense once the scene is actually on screen.
  const showStatusPanel = (beat.type === 'narration' && beat.scene) || beat.type === 'assessment_menu';

  if (isPortrait) {
    return (
      <Stage>
        <RotateGate />
      </Stage>
    );
  }

  if (!began) {
    return (
      <Stage>
        <BeginGate onBegin={() => setBegan(true)} />
      </Stage>
    );
  }

  return (
    <Stage>
      <div className="vn-bg-layer">
        <ImageOrPlaceholder src={bg} alt={script.title} label={`${strings.scene_placeholder_prefix} ${script.title}`} />
      </div>

      <button type="button" className="vn-mute-toggle" onClick={toggleMute}>
        {muted ? strings.mute_off_icon : strings.mute_on_icon}
      </button>

      {showStatusPanel && script.situation_panel && (
        <div className="vn-patient-panel">
          <StatusPanel panel={script.situation_panel} />
        </div>
      )}

      {showTimer && (
        <VNTimer
          deadline={timedSegmentRef.current.deadline}
          totalMs={DECISION_WINDOW_MS}
          onExpire={handleDecisionExpire}
        />
      )}
      {showProbeTimer && probeDeadlineRef.current && (
        <VNTimer deadline={probeDeadlineRef.current} totalMs={PROBE_TIMER_MS} onExpire={handleProbeExpire} />
      )}

      {(beat.type === 'speech' || beat.type === 'probe' || beat.type === 'decision') && (
        <Portrait src={beat.portrait} visible />
      )}

      {beat.type === 'dispatch' && (
        <DialogueBox text={beat.text} onAdvance={advanceBeat} mono />
      )}

      {beat.type === 'narration' && (
        <DialogueBox text={beat.text} onAdvance={advanceBeat} />
      )}

      {beat.type === 'speech' && (
        <DialogueBox speaker={beat.speaker} text={beat.text} onAdvance={advanceBeat} />
      )}

      {beat.type === 'assessment_menu' && !assessmentResult && (
        <DialogueBox
          text={strings.vn_assessment_prompt}
          choices={[
            ...beat.options
              .filter((o) => !assessmentsTaken.includes(o.id))
              .map((o) => ({ id: o.id, label: o.label })),
            { id: DONE_ID, label: strings.vn_assessment_done_label },
          ]}
          onChoice={handleAssessmentPick}
        />
      )}
      {beat.type === 'assessment_menu' && assessmentResult && (
        <DialogueBox text={assessmentResult.result} onAdvance={handleAssessmentResultAdvance} />
      )}

      {beat.type === 'decision' && !confirming && (
        <DialogueBox
          text={decisionForced ? strings.no_more_time_line : beat.prompt}
          choices={beat.options.map((o) => ({ id: o.id, label: o.text }))}
          onChoice={handleDecisionChoice}
        />
      )}
      {beat.type === 'decision' && confirming && (
        <DialogueBox
          text={strings.vn_commit_confirm_text}
          choices={[
            { id: 'commit', label: strings.vn_commit_button },
            { id: 'cancel', label: strings.vn_choose_again_button },
          ]}
          onChoice={handleCommitConfirm}
        />
      )}

      {beat.type === 'probe' && (
        <div className="vn-probe-wrap">
          <DialogueBox
            speaker="Alan"
            text={`${strings.probe_line1}\n"${strings.probe_question}"`}
            onAdvance={() => {}}
          />
          <textarea
            className="vn-probe-input"
            maxLength={500}
            placeholder={strings.probe_placeholder}
            value={probeDraft}
            onChange={(e) => setProbeDraft(e.target.value)}
          />
          <button type="button" className="btn btn-primary vn-probe-submit" onClick={submitProbe}>
            {strings.probe_submit_button}
          </button>
        </div>
      )}

      {beat.type === 'halt' && (
        <>
          {haltStep === 0 && (
            <DialogueBox text={beat.prelude} onAdvance={() => setHaltStep(1)} />
          )}
          {haltStep === 1 && (
            <DialogueBox text={beat.text} onAdvance={() => setHaltStep(2)} />
          )}
          {haltStep === 2 && (
            <>
              {haltSavingChip && <span className="saving-chip vn-saving-chip">{strings.halt_saving_chip}</span>}
              <DialogueBox
                text=""
                choices={[
                  ...(haltUnlocked
                    ? [{ id: 'ready', label: strings.halt_ready_button }]
                    : []),
                  { id: 'exit', label: strings.vn_return_to_depot },
                ]}
                onChoice={(id) => {
                  if (id === 'ready') {
                    gotoRevealDirect(roll, caseId);
                    return;
                  }
                  onExit();
                }}
              />
            </>
          )}
        </>
      )}
    </Stage>
  );
}
