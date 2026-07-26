import React from 'react';

// Alan stands in the scene like a VN sprite when he's speaking — present,
// not filed away.
export default function Portrait({ src, visible }) {
  return (
    <div className={`vn-portrait-slot${visible ? ' visible' : ''}`}>
      {src && <img className="vn-portrait-img" src={`/img/${src}`} alt="Alan" />}
    </div>
  );
}
