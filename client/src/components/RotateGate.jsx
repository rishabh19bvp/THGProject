import React, { useEffect, useState } from 'react';
import { useStrings } from '../state/strings';

function isPortraitNow() {
  return window.innerHeight > window.innerWidth;
}

export function usePortrait() {
  const [portrait, setPortrait] = useState(isPortraitNow);

  useEffect(() => {
    function onResize() {
      setPortrait(isPortraitNow());
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return portrait;
}

// §1.1 / §5 — portrait viewport shows only this, nothing else, until rotated.
export default function RotateGate() {
  const strings = useStrings();
  return (
    <div className="vn-rotate-gate">
      <div className="vn-rotate-icon" aria-hidden="true">⟳</div>
      <p>{strings.vn_rotate_device}</p>
    </div>
  );
}
