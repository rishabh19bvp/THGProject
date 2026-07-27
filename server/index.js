const path = require('path');
const fs = require('fs');
const express = require('express');
const { statements } = require('./db');

const PORT = process.env.PORT || 4000;
const TEACHER_SECRET = process.env.TEACHER_SECRET || 'quietfloor-secret';

const CASES_PATH = path.join(__dirname, 'data', 'cases.json');
const STRINGS_PATH = path.join(__dirname, 'data', 'strings.json');
const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'));
const strings = JSON.parse(fs.readFileSync(STRINGS_PATH, 'utf-8'));
const casesById = new Map(cases.map((c) => [c.id, c]));
const casesInOrder = [...cases].sort((a, b) => a.id - b.id);

const app = express();
app.use(express.json());

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '');
}

// Known-good enums for every drill field — server never trusts free-form
// values from the client for anything that drives priority/reporting.
const CATEGORY_OPTIONS = ['Service Request', 'Access Request', 'Standard Change', 'Major Incident'];
const IMPACT_OPTIONS = ['Low', 'Medium', 'High', 'Extensive'];
const URGENCY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const NOTIFY_OPTIONS = ['WMS Engineering', 'Floor Operations', 'Peak Readiness Owner', 'No one — closing as routine'];
const CLOSURE_OPTIONS = ['Resolved — Fixed', 'Resolved — No Fault Found', 'Closed — Duplicate', 'Cancelled'];

// Impact x Urgency -> Priority. Admin-configured in a real ServiceDesk Plus
// instance (Admin > Helpdesk Customizer > Priority Matrix) — this is THG's
// own matrix, mirrored in client/src/screens/TicketDrill.jsx for the live
// preview; this copy is the one that actually gets persisted.
const PRIORITY_MATRIX = {
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium', Critical: 'Medium' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'Medium', Critical: 'High' },
  High: { Low: 'Medium', Medium: 'Medium', High: 'High', Critical: 'Critical' },
  Extensive: { Low: 'Medium', Medium: 'High', High: 'Critical', Critical: 'Critical' },
};

// case-independent copy
app.get('/api/strings', (req, res) => {
  res.json(strings);
});

app.get('/api/cases-list', (req, res) => {
  res.json(casesInOrder.map((c) => ({ id: c.id, title: c.title })));
});

// the situation brief + drill script for a case — everything the client
// needs to run the 6-step ticket lifecycle, plus the option lists so
// dropdowns always match server-side validation.
app.get('/api/drill/:caseId', (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const caseObj = casesById.get(caseId);
  if (!caseObj) return res.status(404).json({ error: 'case not found' });

  res.json({
    id: caseObj.id,
    title: caseObj.title,
    brief: caseObj.brief,
    drills: caseObj.drills,
    options: {
      category: CATEGORY_OPTIONS,
      impact: IMPACT_OPTIONS,
      urgency: URGENCY_OPTIONS,
      notify: NOTIFY_OPTIONS,
      closure: CLOSURE_OPTIONS,
    },
  });
});

// GET /api/depot?roll=XX — case list with per-roll status, derived from each
// case's most recent ticket (append-only: a replay is a new row, never an
// update to an old one, so a stale ticket can never masquerade as current).
//   AVAILABLE  — no ticket yet (or the last one was closed; replay makes a new one)
//   OPEN       — a ticket exists and is still open (mid-drill, resumable)
//   COMPLETED  — the latest ticket is closed
app.get('/api/depot', (req, res) => {
  const roll = req.query.roll || '';
  if (!roll) return res.status(400).json({ error: 'roll required' });

  const casesOut = casesInOrder.map((c) => {
    const ticket = statements.getLatestTicketForCase.get(roll, c.id);
    let status = 'AVAILABLE';
    let ticketId = null;
    if (ticket) {
      status = ticket.status === 'Closed' ? 'COMPLETED' : 'OPEN';
      ticketId = ticket.id;
    }
    return { case_id: c.id, title: c.title, status, ticket_id: ticketId };
  });

  res.json({ cases: casesOut });
});

function requireTicket(req, res) {
  const id = parseInt(req.params.id, 10);
  const ticket = statements.getTicket.get(id);
  if (!ticket) {
    res.status(404).json({ error: 'ticket not found' });
    return null;
  }
  return ticket;
}

// drill 1 — raise a new ticket
app.post('/api/ticket', (req, res) => {
  const { roll_number, case_id, title, category, description } = req.body || {};
  if (!roll_number || typeof roll_number !== 'string') {
    return res.status(400).json({ error: 'roll_number required' });
  }
  const caseId = parseInt(case_id, 10);
  if (!casesById.has(caseId)) {
    return res.status(400).json({ error: 'invalid case_id' });
  }
  if (!CATEGORY_OPTIONS.includes(category)) {
    return res.status(400).json({ error: 'invalid category' });
  }
  const cleanTitle = stripHtml(title || '').trim().slice(0, 200);
  const cleanDescription = stripHtml(description || '').trim().slice(0, 1000);
  if (!cleanTitle) return res.status(400).json({ error: 'title required' });

  const result = statements.insertTicket.run({
    roll_number,
    case_id: caseId,
    title: cleanTitle,
    category,
    description: cleanDescription,
  });
  const ticketId = result.lastInsertRowid;
  statements.insertEvent.run({
    ticket_id: ticketId,
    type: 'CREATED',
    detail: JSON.stringify({ title: cleanTitle, category, description: cleanDescription }),
  });

  res.json({ id: ticketId });
});

// drills 2 & 4 — set (or re-set, as the situation develops) Impact/Urgency;
// Priority is always derived server-side from the validated pair, never
// trusted as a client-computed value.
app.post('/api/ticket/:id/priority', (req, res) => {
  const ticket = requireTicket(req, res);
  if (!ticket) return;
  const { impact, urgency } = req.body || {};
  if (!IMPACT_OPTIONS.includes(impact)) return res.status(400).json({ error: 'invalid impact' });
  if (!URGENCY_OPTIONS.includes(urgency)) return res.status(400).json({ error: 'invalid urgency' });

  const priority = PRIORITY_MATRIX[impact][urgency];
  const previousPriority = ticket.priority || null;
  statements.setTicketPriority.run({ id: ticket.id, impact, urgency, priority });
  statements.insertEvent.run({
    ticket_id: ticket.id,
    type: 'PRIORITY_CHANGED',
    detail: JSON.stringify({ impact, urgency, priority, previous_priority: previousPriority }),
  });

  res.json({ priority });
});

// drill 3 — route/notify
app.post('/api/ticket/:id/notify', (req, res) => {
  const ticket = requireTicket(req, res);
  if (!ticket) return;
  const { notify_group } = req.body || {};
  if (!NOTIFY_OPTIONS.includes(notify_group)) return res.status(400).json({ error: 'invalid notify_group' });

  statements.setTicketNotify.run({ id: ticket.id, notify_group });
  statements.insertEvent.run({
    ticket_id: ticket.id,
    type: 'NOTIFY_SET',
    detail: JSON.stringify({ notify_group }),
  });

  res.json({ ok: true });
});

// drill 5 — add a WorkLog (a technician's own time-tracked work entry,
// distinct from a Note — this is the real ServiceDesk Plus distinction)
app.post('/api/ticket/:id/worklog', (req, res) => {
  const ticket = requireTicket(req, res);
  if (!ticket) return;
  const { description, time_spent_minutes, first_response } = req.body || {};
  const cleanDescription = stripHtml(description || '').trim().slice(0, 1000);
  if (!cleanDescription) return res.status(400).json({ error: 'description required' });
  const minutes = Math.min(Math.max(parseInt(time_spent_minutes, 10) || 0, 0), 600);

  statements.insertEvent.run({
    ticket_id: ticket.id,
    type: 'WORKLOG',
    detail: JSON.stringify({
      description: cleanDescription,
      time_spent_minutes: minutes,
      first_response: !!first_response,
    }),
  });

  res.json({ ok: true });
});

// drill 6 — close with a closure code
app.post('/api/ticket/:id/close', (req, res) => {
  const ticket = requireTicket(req, res);
  if (!ticket) return;
  const { fcr, requester_ack, closure_code, closure_comments } = req.body || {};
  if (!CLOSURE_OPTIONS.includes(closure_code)) return res.status(400).json({ error: 'invalid closure_code' });
  const cleanComments = stripHtml(closure_comments || '').trim().slice(0, 1000);

  statements.closeTicket.run({
    id: ticket.id,
    closure_code,
    closure_comments: cleanComments,
    fcr: fcr ? 1 : 0,
    requester_ack: requester_ack ? 1 : 0,
  });
  statements.insertEvent.run({
    ticket_id: ticket.id,
    type: 'CLOSED',
    detail: JSON.stringify({ closure_code, closure_comments: cleanComments, fcr: !!fcr, requester_ack: !!requester_ack }),
  });

  res.json({ ok: true });
});

// full ticket + its event timeline — used to resume mid-drill and to render
// the completion summary.
app.get('/api/ticket/:id', (req, res) => {
  const ticket = requireTicket(req, res);
  if (!ticket) return;
  const events = statements.getEventsForTicket.all(ticket.id).map((e) => ({
    type: e.type,
    detail: JSON.parse(e.detail),
    created_at: e.created_at,
  }));
  res.json({ ticket, events });
});

// 6.5 — teacher endpoints. Read-only aggregate view for a facilitator; no
// gating, matches the corporate self-paced model.
function requireSecret(req, res, next) {
  if (req.params.secret !== TEACHER_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}

app.get('/api/teacher/:secret/summary/:caseId', requireSecret, (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const caseObj = casesById.get(caseId);
  if (!caseObj) return res.status(404).json({ error: 'case not found' });

  const tickets = statements.getTicketsForCase.all(caseId);
  const closed = tickets.filter((t) => t.status === 'Closed');
  const categorySplit = {};
  const closureSplit = {};
  tickets.forEach((t) => {
    categorySplit[t.category] = (categorySplit[t.category] || 0) + 1;
  });
  closed.forEach((t) => {
    closureSplit[t.closure_code] = (closureSplit[t.closure_code] || 0) + 1;
  });

  res.json({
    case_id: caseId,
    title: caseObj.title,
    tickets_count: tickets.length,
    closed_count: closed.length,
    category_split: categorySplit,
    closure_split: closureSplit,
  });
});

// static client build (production)
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`The Quiet Floor server listening on port ${PORT}`);
});
