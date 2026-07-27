const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'quietfloor.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Ticket lifecycle model: a `tickets` row is created once per playthrough
// (append-only, no unique constraint — a replay is a brand new row, never an
// update to an old one, so "is this attempt done" never depends on stale
// data from a previous attempt). `ticket_events` is the audit trail each
// drill appends to, and doubles as the completion summary's timeline.
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL,
    case_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    impact TEXT NOT NULL DEFAULT '',
    urgency TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT '',
    notify_group TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Open',
    closure_code TEXT,
    closure_comments TEXT,
    fcr INTEGER,
    requester_ack INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ticket_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const statements = {
  insertTicket: db.prepare(`
    INSERT INTO tickets (roll_number, case_id, title, category, description)
    VALUES (@roll_number, @case_id, @title, @category, @description)
  `),
  getTicket: db.prepare('SELECT * FROM tickets WHERE id = ?'),
  getLatestTicketForCase: db.prepare(
    'SELECT * FROM tickets WHERE roll_number = ? AND case_id = ? ORDER BY created_at DESC LIMIT 1'
  ),
  getTicketsForCase: db.prepare(
    'SELECT * FROM tickets WHERE case_id = ? ORDER BY created_at ASC'
  ),

  setTicketPriority: db.prepare(`
    UPDATE tickets SET impact = @impact, urgency = @urgency, priority = @priority, updated_at = datetime('now')
    WHERE id = @id
  `),
  setTicketNotify: db.prepare(`
    UPDATE tickets SET notify_group = @notify_group, updated_at = datetime('now')
    WHERE id = @id
  `),
  closeTicket: db.prepare(`
    UPDATE tickets SET
      status = 'Closed',
      closure_code = @closure_code,
      closure_comments = @closure_comments,
      fcr = @fcr,
      requester_ack = @requester_ack,
      updated_at = datetime('now')
    WHERE id = @id
  `),

  insertEvent: db.prepare(`
    INSERT INTO ticket_events (ticket_id, type, detail) VALUES (@ticket_id, @type, @detail)
  `),
  getEventsForTicket: db.prepare(
    'SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC'
  ),
};

module.exports = { db, statements };
