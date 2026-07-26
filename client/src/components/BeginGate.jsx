import React from 'react';
import { useStrings } from '../state/strings';

// §5 — fullscreen + orientation lock only work from a user gesture. This tap
// is that gesture. requestFullscreen/orientation.lock can hang instead of
// rejecting in some embedded/restricted browser contexts, so each is capped
// with a timeout — entering the game must never depend on either succeeding.
function withTimeout(promise, ms) {
  return Promise.race([
    Promise.resolve(promise).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]);
}

export default function BeginGate({ onBegin }) {
  const strings = useStrings();

  async function handleTap() {
    const el = document.documentElement;
    if (el.requestFullscreen) await withTimeout(el.requestFullscreen(), 800);
    else if (el.webkitRequestFullscreen) await withTimeout(el.webkitRequestFullscreen(), 800);

    if (screen.orientation && screen.orientation.lock) {
      await withTimeout(screen.orientation.lock('landscape'), 800);
    }

    onBegin();
  }

  return (
    <div className="vn-begin-gate" onClick={handleTap}>
      <p>{strings.vn_tap_to_begin}</p>
    </div>
  );
}
