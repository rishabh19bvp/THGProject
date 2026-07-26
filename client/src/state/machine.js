import { createElement, createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import { fetchCase, fetchReveal, flushOutbox } from './api';

const initialState = {
  phase: 'ENTRY', // ENTRY | LOADING | VN | REVEAL | ESCALATION_FORM
  roll: '',
  caseId: null,
  caseData: null,
  vnStartAtHalt: false,
  revealData: null,
  narrativeOptionChosen: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROLL':
      return { ...state, roll: action.roll };
    case 'GOTO_ENTRY':
      return { ...initialState, roll: state.roll };
    case 'GOTO_REVEAL_DIRECT':
      return {
        ...initialState,
        roll: state.roll,
        phase: 'REVEAL',
        caseId: action.caseId,
        caseData: action.caseData,
        revealData: action.revealData,
      };
    case 'START_VN':
      return {
        ...initialState,
        roll: state.roll,
        phase: 'VN',
        caseId: action.caseId,
        vnStartAtHalt: !!action.startAtHalt,
      };
    case 'GOTO_ESCALATION_FORM':
      return {
        ...state,
        phase: 'ESCALATION_FORM',
        caseId: action.caseId,
        narrativeOptionChosen: action.optionChosen,
      };
    default:
      return state;
  }
}

const GameContext = createContext(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // every case now plays through the VN, which owns its own submission
  // durability (VNGame.jsx) — this just retries anything left over from a
  // session that was interrupted mid-flush (§7.4 airplane-mode guarantee).
  useEffect(() => {
    flushOutbox();
  }, []);

  // --- browser back returns to Depot without clearing submission (§7.1) ---
  useEffect(() => {
    function onPopState() {
      dispatch({ type: 'GOTO_ENTRY' });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setRoll = useCallback((roll) => dispatch({ type: 'SET_ROLL', roll }), []);

  // RESOLVED halt slip on the Depot, or a re-tapped already-reviewed practice
  // case in a Case File folder — reveal is unlocked by definition in both.
  const gotoRevealDirect = useCallback(async (roll, caseId) => {
    window.history.pushState({ inFlow: true }, '', '/');
    const [caseData, revealData] = await Promise.all([
      fetchCase(caseId, roll),
      fetchReveal(caseId, roll),
    ]);
    dispatch({ type: 'GOTO_REVEAL_DIRECT', caseId, caseData, revealData });
  }, []);

  // phase 'ENTRY' is the Depot home screen in Phase 2 — same reducer action,
  // new meaning. Exposed under its real name so callers read clearly.
  const gotoDepot = useCallback(() => dispatch({ type: 'GOTO_ENTRY' }), []);

  // every case plays through the VN now. `startAtHalt` re-enters a PENDING
  // halt case straight at its cliffhanger beat instead of replaying the scene.
  const startVN = useCallback((caseId, opts = {}) => {
    window.history.pushState({ inFlow: true }, '', '/');
    dispatch({ type: 'START_VN', caseId, startAtHalt: !!opts.startAtHalt });
  }, []);

  // build spec §5.1 — reached from Reveal via "Log it", regardless of which
  // narrative option the trainee chose.
  const gotoEscalationForm = useCallback((caseId, optionChosen) => {
    dispatch({ type: 'GOTO_ESCALATION_FORM', caseId, optionChosen });
  }, []);

  const value = {
    state,
    setRoll,
    startVN,
    gotoRevealDirect,
    gotoDepot,
    gotoEscalationForm,
  };

  return createElement(GameContext.Provider, { value }, children);
}
