import React from 'react';

export default function StatusPanel({ panel }) {
  if (!panel || panel.length === 0) return null;
  return (
    <div className="patient-panel">
      {panel.map(({ label, value }) => (
        <div key={label}>
          <div className="field-label">{label}</div>
          <div className="field-value">{value}</div>
        </div>
      ))}
    </div>
  );
}
