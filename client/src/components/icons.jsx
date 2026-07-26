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

export function FolderIcon(props) {
  return (
    <Icon
      {...props}
      path={<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />}
    />
  );
}

export function FolderOpenIcon(props) {
  return (
    <Icon
      {...props}
      path={<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />}
    />
  );
}

export function FolderLockIcon(props) {
  return (
    <Icon
      {...props}
      path={
        <>
          <rect width="8" height="5" x="14" y="17" rx="1" />
          <path d="M10 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v2.5" />
          <path d="M20 17v-2a2 2 0 1 0-4 0v2" />
        </>
      }
    />
  );
}

export function ArchiveIcon(props) {
  return (
    <Icon
      {...props}
      path={
        <>
          <rect width="20" height="5" x="2" y="3" rx="1" />
          <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
          <path d="M10 12h4" />
        </>
      }
    />
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

export function LockIcon(props) {
  return (
    <Icon
      {...props}
      path={
        <>
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      }
    />
  );
}
