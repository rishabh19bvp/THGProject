const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'data', 'quietfloor.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL,
    case_id INTEGER NOT NULL,
    variant INTEGER NOT NULL,
    assessments_taken TEXT NOT NULL,
    option_chosen TEXT NOT NULL,
    justification TEXT NOT NULL DEFAULT '',
    time_to_decision_ms INTEGER NOT NULL,
    resubmitted INTEGER NOT NULL DEFAULT 0,
    halt_revisits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(roll_number, case_id)
  );

  CREATE TABLE IF NOT EXISTS escalation_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_number TEXT NOT NULL,
    case_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    impact TEXT NOT NULL,
    urgency TEXT NOT NULL,
    priority TEXT NOT NULL,
    notify_group TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    narrative_option_chosen TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// migration: submissions.kind (pre-Phase-2 DBs won't have this column yet)
try {
  db.exec("ALTER TABLE submissions ADD COLUMN kind TEXT NOT NULL DEFAULT 'halt'");
} catch (e) {
  if (!/duplicate column name/i.test(e.message)) throw e;
}

// Corporate self-paced model: progression and reveal-visibility are both
// derived directly from a roll's own submissions (see index.js's
// computeCurrentCaseId / /api/reveal), so there's no separate cohort-wide
// "topic state" or "reveal unlock" flag to persist — a trainee's own row in
// `submissions` is the only state that matters.
const statements = {
  getSubmission: db.prepare(
    'SELECT * FROM submissions WHERE roll_number = ? AND case_id = ?'
  ),
  insertSubmission: db.prepare(`
    INSERT INTO submissions
      (roll_number, case_id, variant, assessments_taken, option_chosen, justification, time_to_decision_ms, resubmitted, kind)
    VALUES (@roll_number, @case_id, @variant, @assessments_taken, @option_chosen, @justification, @time_to_decision_ms, 0, @kind)
  `),
  updateSubmission: db.prepare(`
    UPDATE submissions SET
      variant = @variant,
      assessments_taken = @assessments_taken,
      option_chosen = @option_chosen,
      justification = @justification,
      time_to_decision_ms = @time_to_decision_ms,
      resubmitted = 1
    WHERE roll_number = @roll_number AND case_id = @case_id
  `),
  incrementHaltRevisit: db.prepare(`
    UPDATE submissions SET halt_revisits = halt_revisits + 1
    WHERE roll_number = ? AND case_id = ?
  `),
  getSubmissionsForCase: db.prepare(
    'SELECT * FROM submissions WHERE case_id = ? ORDER BY created_at ASC'
  ),
  getSubmissionsForRoll: db.prepare(
    'SELECT * FROM submissions WHERE roll_number = ? ORDER BY created_at ASC'
  ),

  // escalation form (§5.4)
  insertEscalationSubmission: db.prepare(`
    INSERT INTO escalation_submissions
      (roll_number, case_id, category, impact, urgency, priority, notify_group, description, narrative_option_chosen)
    VALUES (@roll_number, @case_id, @category, @impact, @urgency, @priority, @notify_group, @description, @narrative_option_chosen)
  `),
  getEscalationSubmission: db.prepare(
    'SELECT id FROM escalation_submissions WHERE roll_number = ? AND case_id = ? LIMIT 1'
  ),
};

module.exports = { db, statements };
