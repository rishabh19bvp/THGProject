const fs = require('fs');
const path = require('path');
require('./db'); // side effect only: ensures the sqlite tables exist

const CASES_PATH = path.join(__dirname, 'data', 'cases.json');

function fail(msg) {
  console.error(`[seed] SCHEMA VALIDATION FAILED: ${msg}`);
  process.exit(1);
}

function validateCase(c) {
  const ctx = `case ${c && c.id}`;
  if (typeof c.id !== 'number') fail(`${ctx}: missing/invalid id`);
  if (typeof c.title !== 'string' || !c.title) fail(`${ctx}: missing title`);
  if (!Array.isArray(c.brief) || c.brief.length === 0) fail(`${ctx}: missing brief`);
  c.brief.forEach((line, i) => {
    if (typeof line !== 'string' || !line) fail(`${ctx}: brief line ${i} empty`);
  });

  const d = c.drills;
  if (!d || typeof d !== 'object') fail(`${ctx}: missing drills`);
  const requiredStrings = [
    'correct_category', 'description_seed', 'initial_impact', 'initial_urgency',
    'correct_notify', 'escalation_brief', 'escalated_impact', 'worklog_seed',
    'correct_closure', 'closure_comment_seed',
  ];
  requiredStrings.forEach((key) => {
    if (typeof d[key] !== 'string' || !d[key]) fail(`${ctx}: drills.${key} missing`);
  });
}

function seed() {
  if (!fs.existsSync(CASES_PATH)) {
    fail(`cases.json not found at ${CASES_PATH}`);
  }
  let cases;
  try {
    cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'));
  } catch (e) {
    fail(`cases.json is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(cases) || cases.length === 0) {
    fail('cases.json must be a non-empty array');
  }

  cases.forEach(validateCase);

  // Corporate self-paced model: no cohort-wide state to bootstrap. Every
  // case is visible and playable in any order, any number of times —
  // progression is derived per-roll from the tickets table at request time.
  console.log(`[seed] OK — validated ${cases.length} case(s).`);
}

seed();
