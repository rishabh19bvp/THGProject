import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useStrings } from '../state/strings';
import { fetchCasesList, fetchTeacherSummary, fetchTeacherReveal } from '../state/api';
import './teacher.css';

function SplitBar({ split }) {
  const total = split.A + split.B + split.C;
  if (total === 0) {
    return <div className="split-bar" />;
  }
  return (
    <div className="split-bar">
      {['A', 'B', 'C'].map((opt) => {
        const pct = (split[opt] / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={opt}
            className={`split-bar-segment opt-${opt.toLowerCase()}`}
            style={{ width: `${pct}%` }}
          >
            {opt} {split[opt]}
          </div>
        );
      })}
    </div>
  );
}

function VariantGrid({ grid }) {
  const variants = Object.keys(grid).sort();
  if (variants.length === 0) return null;
  return (
    <div className="variant-grid">
      <table>
        <thead>
          <tr>
            <th>Variant</th>
            <th>A</th>
            <th>B</th>
            <th>C</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v}>
              <td>{v}</td>
              <td>{grid[v].A}</td>
              <td>{grid[v].B}</td>
              <td>{grid[v].C}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JustificationList({ byOption }) {
  return (
    <div className="justification-list">
      {['A', 'B', 'C'].map((opt) => (
        <details key={opt}>
          <summary>Option {opt} ({byOption[opt].length})</summary>
          {byOption[opt].map((row, i) => (
            <div className="justification-row" key={i}>
              <span>
                {row.roll_number}
                <span className="variant-badge">V{row.variant}</span>
                {row.resubmitted && <span className="resubmitted-badge">resubmitted</span>}
              </span>
              <span>{row.justification || <em>(empty)</em>}</span>
            </div>
          ))}
        </details>
      ))}
    </div>
  );
}

function ProjectMode({ strings, matrix, onClose }) {
  const [page, setPage] = useState(0);

  const slides = [
    { kind: 'opener' },
    ...matrix.flatMap((m) => [
      { kind: 'setup', variant: m.variant, text: m.setup },
      { kind: 'option', variant: m.variant, opt: 'A', text: m.outcomes.A },
      { kind: 'option', variant: m.variant, opt: 'B', text: m.outcomes.B },
      { kind: 'option', variant: m.variant, opt: 'C', text: m.outcomes.C },
      { kind: 'concept', variant: m.variant, text: m.concept },
    ]),
  ];
  const lastPage = slides.length - 1;
  const slide = slides[page];

  function advance() {
    setPage((p) => Math.min(p + 1, lastPage));
  }

  return (
    <div className="project-mode-overlay" onClick={advance}>
      <button
        type="button"
        className="project-mode-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        Close
      </button>
      {slide.kind === 'opener' && (
        <>
          <h1>{strings.reveal_header}</h1>
          <p>{strings.reveal_intro}</p>
        </>
      )}
      {slide.kind === 'setup' && (
        <>
          <h1>Variant {slide.variant}</h1>
          <p>{slide.text}</p>
        </>
      )}
      {slide.kind === 'option' && (
        <>
          <h1>Option {slide.opt}</h1>
          <p>{slide.text}</p>
        </>
      )}
      {slide.kind === 'concept' && (
        <p>{slide.text}</p>
      )}
      {page < lastPage && <div className="project-mode-hint">Tap to continue</div>}
    </div>
  );
}

// Corporate self-paced model: each trainee moves through cases at their own
// pace and unlocks their own reveal automatically (no facilitator gate). This
// dashboard is a read-only aggregate view for a facilitator to watch cohort
// stats and pull up a case's outcome matrix for group discussion — it no
// longer controls what any trainee can see.
export default function TeacherDashboard() {
  const { secret } = useParams();
  const strings = useStrings();
  const [casesList, setCasesList] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [forbidden, setForbidden] = useState(false);
  const [projectMode, setProjectMode] = useState(null); // { caseId, matrix }

  const refresh = useCallback(async () => {
    if (casesList.length === 0) return;
    const results = {};
    for (const c of casesList) {
      const data = await fetchTeacherSummary(secret, c.id);
      if (data.forbidden) {
        setForbidden(true);
        return;
      }
      results[c.id] = data;
    }
    setSummaries(results);
  }, [casesList, secret]);

  useEffect(() => {
    fetchCasesList().then(setCasesList);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function openProjectMode(caseId) {
    const data = await fetchTeacherReveal(secret, caseId);
    if (data.forbidden) {
      setForbidden(true);
      return;
    }
    setProjectMode({ caseId, matrix: data.matrix });
  }

  if (forbidden) {
    return <div className="teacher-dashboard">Forbidden — wrong secret.</div>;
  }

  if (projectMode) {
    return (
      <ProjectMode
        strings={strings}
        matrix={projectMode.matrix}
        onClose={() => setProjectMode(null)}
      />
    );
  }

  return (
    <div className="teacher-dashboard">
      <h1>The Quiet Floor — Facilitator Dashboard</h1>

      <div className="teacher-panels">
        {casesList.map((c) => {
          const s = summaries[c.id];
          if (!s) return null;
          return (
            <div className="teacher-panel" key={c.id}>
              <h2>{c.title}</h2>
              <div className="teacher-stats-row">
                <span>{s.submissions_count} submissions</span>
                <span>avg {Math.round(s.avg_time_to_decision_ms / 1000)}s to decide</span>
                <span>{s.total_halt_revisits} halt revisits</span>
              </div>
              <SplitBar split={s.option_split} />
              <VariantGrid grid={s.variant_option_grid} />
              <JustificationList byOption={s.justifications_by_option} />
              <div className="teacher-actions">
                <button type="button" className="btn btn-primary" onClick={() => openProjectMode(c.id)}>
                  {strings.teacher_project_mode}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
