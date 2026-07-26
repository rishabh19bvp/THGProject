// Corporate deployment: no ambient/game music, no SFX cues — just the
// typewriter blip on dialogue text, muteable like everything else was.
const MUTE_KEY = 'quietfloor:audioMuted';
const TYPEWRITER_SRC = '/audio/typewriter-blip.mp3';

let blipEl = null;

export function isMuted() {
  return localStorage.getItem(MUTE_KEY) === '1';
}

export function setMuted(muted) {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
}

// typewriter blip fires once per character — reuse one element instead of
// constructing an Audio() per keystroke.
export function playBlip() {
  if (isMuted()) return;
  try {
    if (!blipEl) {
      blipEl = new Audio(TYPEWRITER_SRC);
      blipEl.volume = 0.25;
    }
    blipEl.currentTime = 0;
    blipEl.play().catch(() => {});
  } catch (e) {
    // fail silent
  }
}
