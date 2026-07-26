import React, { useEffect, useRef, useState } from 'react';
import { playBlip } from '../state/audio';

const CHAR_MS = 35;

// Persistent bottom-third box. Typewriter reveal, tap-to-complete,
// tap-to-advance, and in-box choice menus (vn_vertical_slice_spec §2, §3).
export default function DialogueBox({ speaker, text, choices, onAdvance, onChoice, mono }) {
  const [shownLength, setShownLength] = useState(0);
  const intervalRef = useRef(null);

  const isComplete = shownLength >= text.length;

  useEffect(() => {
    setShownLength(0);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setShownLength((n) => {
        if (n >= text.length) {
          clearInterval(intervalRef.current);
          return n;
        }
        playBlip();
        return n + 1;
      });
    }, CHAR_MS);
    return () => clearInterval(intervalRef.current);
  }, [text]);

  function handleTap() {
    if (choices) return; // choices handle their own taps, box-tap is a no-op
    if (!isComplete) {
      clearInterval(intervalRef.current);
      setShownLength(text.length);
      return;
    }
    onAdvance && onAdvance();
  }

  return (
    <div className="vn-dialogue-box" onClick={handleTap}>
      {speaker && <div className="vn-name-tag">{speaker}</div>}
      <p className={`vn-dialogue-text${mono ? ' mono' : ''}`}>{text.slice(0, shownLength)}</p>

      {isComplete && choices && (
        <div className="vn-choice-menu" onClick={(e) => e.stopPropagation()}>
          {choices.map((c) => (
            <button
              key={c.id}
              type="button"
              className="vn-choice-btn"
              onClick={() => onChoice(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {isComplete && !choices && <div className="vn-advance-indicator" aria-hidden="true">▾</div>}
    </div>
  );
}
