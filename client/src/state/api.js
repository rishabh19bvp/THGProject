export async function fetchStrings() {
  const res = await fetch('/api/strings');
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

export async function fetchDepot(roll) {
  const res = await fetch(`/api/depot?roll=${encodeURIComponent(roll)}`);
  if (!res.ok) throw new Error('depot fetch failed');
  return res.json();
}

// the situation brief + drill script for a case
export async function fetchDrill(caseId) {
  const res = await fetch(`/api/drill/${caseId}`);
  if (!res.ok) throw new Error('drill fetch failed');
  return res.json();
}

// full ticket record + its event timeline (for resume and the summary screen)
export async function fetchTicket(ticketId) {
  const res = await fetch(`/api/ticket/${ticketId}`);
  if (!res.ok) throw new Error('ticket fetch failed');
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${url} failed`);
  }
  return res.json();
}

// drill 1 — raise a new ticket
export function createTicket(payload) {
  return postJson('/api/ticket', payload);
}

// drills 2 & 4 — set/re-set Impact+Urgency, Priority derives server-side
export function setTicketPriority(ticketId, impact, urgency) {
  return postJson(`/api/ticket/${ticketId}/priority`, { impact, urgency });
}

// drill 3 — route/notify
export function setTicketNotify(ticketId, notifyGroup) {
  return postJson(`/api/ticket/${ticketId}/notify`, { notify_group: notifyGroup });
}

// drill 5 — add a WorkLog
export function addTicketWorklog(ticketId, description, timeSpentMinutes, firstResponse) {
  return postJson(`/api/ticket/${ticketId}/worklog`, {
    description,
    time_spent_minutes: timeSpentMinutes,
    first_response: firstResponse,
  });
}

// drill 6 — close with a closure code
export function closeTicket(ticketId, { fcr, requesterAck, closureCode, closureComments }) {
  return postJson(`/api/ticket/${ticketId}/close`, {
    fcr,
    requester_ack: requesterAck,
    closure_code: closureCode,
    closure_comments: closureComments,
  });
}
