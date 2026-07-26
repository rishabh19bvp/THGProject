import React from 'react';

// Lucide icons (ISC license) — https://lucide.dev. Inlined as plain React
// components so the app has zero runtime dependency on the icon package;
// stroke uses currentColor, so they inherit whatever color the caller sets.
function Icon({ path, className, size = 20 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

export function ClipboardCheckIcon(props) {
  return (
    <Icon
      {...props}
      path={
        <>
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="m9 14 2 2 4-4" />
        </>
      }
    />
  );
}
