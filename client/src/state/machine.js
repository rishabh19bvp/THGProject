import { createElement, createContext, useContext, useEffect, useReducer, useCallback } from 'react';

const initialState = {
  phase: 'ENTRY', // ENTRY | DRILL
  roll: '',
  caseId: null,
  // set when resuming an already-open ticket (from Depot's "Resume"); null
  // for a fresh play or a replay — TicketDrill creates a new ticket in that case.
  ticketId: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_ROLL':
      return { ...state, roll: action.roll };
    case 'GOTO_ENTRY':
      return { ...initialState, roll: state.roll };
    case 'START_DRILL':
      return {
        ...initialState,
        roll: state.roll,
        phase: 'DRILL',
        caseId: action.caseId,
        ticketId: action.ticketId || null,
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

  // --- browser back returns to Depot ---
  useEffect(() => {
    function onPopState() {
      dispatch({ type: 'GOTO_ENTRY' });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setRoll = useCallback((roll) => dispatch({ type: 'SET_ROLL', roll }), []);

  const gotoDepot = useCallback(() => dispatch({ type: 'GOTO_ENTRY' }), []);

  // caseId always starts a fresh/replayed ticket; pass ticketId to resume an
  // already-open one (Depot's "Resume" on an OPEN case) at whatever drill it
  // left off on.
  const startDrill = useCallback((caseId, opts = {}) => {
    window.history.pushState({ inFlow: true }, '', '/');
    dispatch({ type: 'START_DRILL', caseId, ticketId: opts.ticketId || null });
  }, []);

  const value = {
    state,
    setRoll,
    startDrill,
    gotoDepot,
  };

  return createElement(GameContext.Provider, { value }, children);
}
