import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchCasesList, fetchTeacherSummary } from '../state/api';
import './teacher.css';

function CountSplit({ split }) {
  const entries = Object.entries(split);
  if (entries.length === 0) return <p className="corp-empty">No data yet.</p>;
  return (
    <ul className="teacher-split-list">
      {entries.map(([label, count]) => (
        <li key={label}>
          <span>{label}</span>
          <span>{count}</span>
        </li>
      ))}
    </ul>
  );
}

// Corporate self-paced model: each trainee moves through cases at their own
// pace with no facilitator gate. This dashboard is a read-only aggregate
// view over the ticket lifecycle — deprioritized per current build focus,
// kept simple and non-crashing rather than redesigned.
export default function TeacherDashboard() {
  const { secret } = useParams();
  const [casesList, setCasesList] = useState([]);
  const [summaries, setSummaries] = useState({});
  const [forbidden, setForbidden] = useState(false);

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

  if (forbidden) {
    return <div className="teacher-dashboard">Forbidden — wrong secret.</div>;
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
                <span>{s.tickets_count} tickets raised</span>
                <span>{s.closed_count} closed</span>
              </div>
              <h3>Category</h3>
              <CountSplit split={s.category_split} />
              <h3>Closure Code</h3>
              <CountSplit split={s.closure_split} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
