import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GameProvider, useGame } from './state/machine';
import { StringsProvider, useStrings } from './state/strings';
import Depot from './screens/Depot';
import TicketDrill from './screens/TicketDrill';
import TeacherDashboard from './teacher/Dashboard';

function screenFor(phase) {
  switch (phase) {
    case 'DRILL':
      return <TicketDrill />;
    case 'ENTRY':
    default:
      return <Depot />;
  }
}

function StudentScreen() {
  const { state } = useGame();
  const strings = useStrings();

  if (state.phase === 'LOADING') {
    return <div className="app-shell">{strings.loading_state}</div>;
  }

  // #5 — 250ms crossfade between screens (§2.2). Keying on phase remounts
  // the wrapper so the animation replays on every transition.
  return (
    <div key={state.phase} className="phase-transition">
      {screenFor(state.phase)}
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

export default function App() {
  return (
    <StringsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<StudentFlow />} />
          <Route path="/teacher/:secret" element={<TeacherDashboard />} />
        </Routes>
      </BrowserRouter>
    </StringsProvider>
  );
}
