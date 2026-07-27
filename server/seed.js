const fs = require('fs');
const path = require('path');
require('./db'); // side effect only: ensures the sqlite tables exist

const CASES_PATH = path.join(__dirname, 'data', 'cases.json');

function fail(msg) {
  console.error(`[seed] SCHEMA VALIDATION FAILED: ${msg}`);
  process.exit(1);
}

const TEACHES_VALUES = ['category', 'priority', 'notify', 'worklog', 'closure'];

function validateCase(c) {
  const ctx = `case ${c && c.id}`;
  if (typeof c.id !== 'number') fail(`${ctx}: missing/invalid id`);
  if (typeof c.title !== 'string' || !c.title) fail(`${ctx}: missing title`);
  if (!TEACHES_VALUES.includes(c.teaches)) fail(`${ctx}: teaches must be one of ${TEACHES_VALUES.join(', ')}`);
  if (typeof c.concept !== 'string' || !c.concept) fail(`${ctx}: missing concept`);

  const scene = c.scene;
  if (!scene || typeof scene !== 'object') fail(`${ctx}: missing scene`);
  if (!Array.isArray(scene.images) || scene.images.length === 0) fail(`${ctx}: scene.images missing`);
  if (!Array.isArray(scene.lines) || scene.lines.length === 0) fail(`${ctx}: scene.lines missing`);
  scene.lines.forEach((line, i) => {
    if (typeof line !== 'string' || !line) fail(`${ctx}: scene.lines[${i}] empty`);
  });

  const d = c.drills;
  if (!d || typeof d !== 'object') fail(`${ctx}: missing drills`);
  if (typeof d.description_seed !== 'string' || !d.description_seed) fail(`${ctx}: drills.description_seed missing`);

  // teaches=category is where the trainee types title/category live — every
  // other scenario needs those preset so the ticket can be created silently
  // before the one interactive step.
  if (c.teaches !== 'category') {
    if (typeof d.title !== 'string' || !d.title) fail(`${ctx}: drills.title missing`);
    if (typeof d.category !== 'string' || !d.category) fail(`${ctx}: drills.category missing`);
  }
  if (c.teaches === 'worklog' && (typeof d.worklog_seed !== 'string' || !d.worklog_seed)) {
    fail(`${ctx}: drills.worklog_seed missing`);
  }
  if (c.teaches === 'closure' && (typeof d.closure_comment_seed !== 'string' || !d.closure_comment_seed)) {
    fail(`${ctx}: drills.closure_comment_seed missing`);
  }
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
