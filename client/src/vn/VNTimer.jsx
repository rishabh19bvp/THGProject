import React, { useEffect, useRef, useState } from 'react';

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatMmSs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

// §4 — appears only during the timed segment (assessment_menu once started,
// through decision, through probe). Same wall-clock anchoring/thresholds as
// the original spec, restyled as a small in-stage element.
export default function VNTimer({ deadline, totalMs, onExpire }) {
  const [now, setNow] = useState(Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const remaining = Math.max(0, deadline - now);
  const seconds = remaining / 1000;

  useEffect(() => {
    if (remaining <= 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpire && onExpire();
    }
  }, [remaining, onExpire]);

  let band = '';
  if (seconds < 30) band = 'danger';
  else if (seconds <= 60) band = 'amber';

  const pct = Math.min(100, Math.max(0, (remaining / totalMs) * 100));
  const dashOffset = CIRCUMFERENCE * (1 - pct / 100);

  return (
    <div className="vn-timer">
      <svg viewBox="0 0 48 48" width="48" height="48">
        <circle className="vn-timer-track" cx="24" cy="24" r={RADIUS} fill="none" strokeWidth="3" />
        <circle
          className={`vn-timer-fill ${band}`}
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className={`vn-timer-numeral ${band === 'danger' ? 'danger' : ''}`}>{formatMmSs(remaining)}</div>
    </div>
  );
}
