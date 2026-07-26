import React, { useState } from 'react';

// §12 — missing image renders a styled placeholder, never a broken-image icon.
export default function ImageOrPlaceholder({ src, alt, label }) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="image-placeholder">
        <span>{label}</span>
      </div>
    );
  }

  return (
    <img
      className="scene-image"
      src={`/img/${src}`}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}
