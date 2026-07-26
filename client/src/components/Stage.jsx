import React, { useEffect, useState } from 'react';

const ASPECT = 16 / 9;

// iOS Safari reserves a strip for the notch/home-indicator that env()
// exposes but window.innerWidth/innerHeight don't subtract — without this,
// the stage's own bottom edge lands exactly under the home-indicator swipe
// gesture, so taps there compete with the OS's edge-swipe recognizer.
function getSafeAreaInsets() {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  document.body.removeChild(probe);
  return insets;
}

function computeSize() {
  const insets = getSafeAreaInsets();
  const vw = window.innerWidth - insets.left - insets.right;
  const vh = window.innerHeight - insets.top - insets.bottom;
  let width;
  let height;
  if (vw / vh > ASPECT) {
    height = vh;
    width = vh * ASPECT;
  } else {
    width = vw;
    height = vw / ASPECT;
  }
  return { width, height };
}

// Fixed 16:9 game canvas — scales to fit the viewport, letterboxed on odd
// screens. Everything inside is positioned by percentage (vn_vertical_slice_spec §2).
export default function Stage({ children }) {
  const [size, setSize] = useState(computeSize);

  useEffect(() => {
    function onResize() {
      setSize(computeSize());
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // iOS fires orientationchange before its own layout/safe-area values
    // settle — one delayed re-measure catches the case where the first
    // read after rotation is still stale.
    function onOrientationSettle() {
      setTimeout(onResize, 250);
    }
    window.addEventListener('orientationchange', onOrientationSettle);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('orientationchange', onOrientationSettle);
    };
  }, []);

  return (
    <div className="vn-root">
      <div className="vn-stage" style={{ width: size.width, height: size.height }}>
        {children}
      </div>
    </div>
  );
}
