const OUTBOX_KEY = 'quietfloor:outbox';
const LANG_KEY = 'quietfloor:lang';

// English default — this deployment ships no Marathi strings (server/data/
// strings.mr.json is absent), so 'mr' would silently resolve to identical
// English content anyway; defaulting to 'en' keeps the lang toggle's own
// displayed state honest for a first-time visitor.
export function getLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'mr' ? 'mr' : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang === 'mr' ? 'mr' : 'en');
  } catch {
    // ignore — falls back to 'en' next read
  }
}

export async function fetchStrings() {
  const res = await fetch(`/api/strings?lang=${getLang()}`);
  if (!res.ok) throw new Error('strings fetch failed');
  return res.json();
}

export async function fetchCasesList() {
  const res = await fetch('/api/cases-list');
  if (!res.ok) throw new Error('cases list fetch failed');
  return res.json();
}

export async function fetchTeacherSummary(secret, caseId) {
  const res = await fetch(`/api/teacher/${encodeURIComponent(secret)}/summary/${caseId}`);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error('teacher summary fetch failed');
  return res.json();
}

export async function fetchTeacherReveal(secret, caseId) {
  const res = await fetch(`/api/teacher/${encodeURIComponent(secret)}/reveal/${caseId}`);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error('teacher reveal fetch failed');
  return res.json();
}

export async function fetchCase(caseId, roll) {
  const res = await fetch(`/api/case/${caseId}?roll=${encodeURIComponent(roll)}&lang=${getLang()}`);
  if (!res.ok) throw new Error('case fetch failed');
  return res.json();
}

export async function fetchVnScript(caseId, roll) {
  const res = await fetch(`/api/vn-script/${caseId}?roll=${encodeURIComponent(roll)}&lang=${getLang()}`);
  if (!res.ok) throw new Error('vn-script fetch failed');
  return res.json();
}

export async function fetchDepot(roll) {
  const res = await fetch(`/api/depot?roll=${encodeURIComponent(roll)}&lang=${getLang()}`);
  if (!res.ok) throw new Error('depot fetch failed');
  return res.json();
}

export async function fetchSubmittedCaseIds(roll) {
  const res = await fetch(`/api/submissions/${encodeURIComponent(roll)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.submitted_case_ids || [];
}

export async function postHaltRevisit(roll, caseId) {
  try {
    await fetch('/api/halt-revisit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roll_number: roll, case_id: caseId }),
    });
  } catch (e) {
    // fire-and-forget per spec §6.3
  }
}

export async function fetchReveal(caseId, roll) {
  const res = await fetch(`/api/reveal/${caseId}?roll=${encodeURIComponent(roll)}&lang=${getLang()}`);
  if (!res.ok) throw new Error('reveal fetch failed');
  return res.json();
}

export async function postEscalationSubmit(payload) {
  const res = await fetch('/api/escalation-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('escalation submit failed');
  return res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch {
    return [];
  }
}

function setOutbox(items) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

function addToOutbox(payload) {
  const items = getOutbox();
  items.push(payload);
  setOutbox(items);
}

async function postSubmitOnce(payload) {
  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('submit failed');
  return res.json();
}

// §7.4 — retry 3x (1s/3s/9s), then queue to outbox. Never blocks HALT render.
export async function submitWithResilience(payload) {
  const delays = [1000, 3000, 9000];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await postSubmitOnce(payload);
      return { ok: true };
    } catch (e) {
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }
  addToOutbox(payload);
  return { ok: false, queued: true };
}

export function hasOutboxEntry(roll, caseId) {
  const items = getOutbox();
  return items.some((p) => p.roll_number === roll && p.case_id === caseId);
}

export async function flushOutbox() {
  const items = getOutbox();
  if (items.length === 0) return;
  const remaining = [];
  for (const payload of items) {
    try {
      await postSubmitOnce(payload);
    } catch (e) {
      remaining.push(payload);
    }
  }
  setOutbox(remaining);
}
