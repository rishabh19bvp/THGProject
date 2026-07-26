import React from 'react';
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from 'react-router-dom';
import { GameProvider, useGame } from './state/machine';
import { StringsProvider, useStrings } from './state/strings';
import Depot from './screens/Depot';
import Reveal from './screens/Reveal';
import EscalationForm from './screens/EscalationForm';
import TeacherDashboard from './teacher/Dashboard';
import VNGame from './vn/VNGame';

function screenFor(phase, state, gotoDepot) {
  switch (phase) {
    case 'REVEAL':
      return <Reveal />;
    case 'ESCALATION_FORM':
      return <EscalationForm />;
    case 'VN':
      return (
        <VNGame
          caseId={state.caseId}
          roll={state.roll}
          startAtHalt={state.vnStartAtHalt}
          onExit={gotoDepot}
        />
      );
    case 'ENTRY':
    default:
      return <Depot />;
  }
}

function StudentScreen() {
  const { state, gotoDepot } = useGame();
  const strings = useStrings();

  if (state.phase === 'LOADING') {
    return <div className="app-shell">{strings.loading_state}</div>;
  }

  // VN is a full-screen fixed-stage game canvas — it must not be wrapped in
  // the classic app-shell crossfade (that's for the Depot/Reveal screens).
  if (state.phase === 'VN') {
    return screenFor('VN', state, gotoDepot);
  }

  // #5 — 250ms crossfade between screens (§2.2). Keying on phase remounts
  // the wrapper so the animation replays on every transition.
  return (
    <div key={state.phase} className="phase-transition">
      {screenFor(state.phase, state, gotoDepot)}
    </div>
  );
}

function StudentFlow() {
  return (
    <GameProvider>
      <StudentScreen />
    </GameProvider>
  );
}

// Dev-only deep links — jump straight to Reveal or the Escalation Form for a
// given case/roll without replaying the whole VN, so these screens can be
// iterated on and refreshed directly. Not part of the trainee-facing flow.
function DevRevealInner({ caseId, roll }) {
  const { gotoRevealDirect } = useGame();
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    gotoRevealDirect(roll, caseId).then(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!ready) return null;
  return <Reveal />;
}

function DevRevealPreview() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  return (
    <GameProvider>
      <DevRevealInner caseId={parseInt(caseId, 10)} roll={searchParams.get('roll') || 'dev-preview'} />
    </GameProvider>
  );
}

function DevEscalationInner({ caseId, roll, option }) {
  const { setRoll, gotoEscalationForm } = useGame();
  React.useEffect(() => {
    setRoll(roll);
    gotoEscalationForm(caseId, option);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <EscalationForm />;
}

function DevEscalationPreview() {
  const { caseId } = useParams();
  const [searchParams] = useSearchParams();
  return (
    <GameProvider>
      <DevEscalationInner
        caseId={parseInt(caseId, 10)}
        roll={searchParams.get('roll') || 'dev-preview'}
        option={searchParams.get('option') || null}
      />
    </GameProvider>
  );
}

export default function App() {
  return (
    <StringsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<StudentFlow />} />
          <Route path="/teacher/:secret" element={<TeacherDashboard />} />
          <Route path="/dev/reveal/:caseId" element={<DevRevealPreview />} />
          <Route path="/dev/escalation/:caseId" element={<DevEscalationPreview />} />
        </Routes>
      </BrowserRouter>
    </StringsProvider>
  );
}
