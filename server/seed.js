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
  if (typeof c.image !== 'string' || !c.image) fail(`${ctx}: missing image`);
  const kind = c.kind || 'halt';
  if (!['halt', 'practice'].includes(kind)) fail(`${ctx}: kind must be 'halt' or 'practice'`);
  if (kind === 'practice') {
    if (typeof c.topic_id !== 'number') fail(`${ctx}: practice case missing topic_id`);
    if (c.resolveImmediately !== true) fail(`${ctx}: practice case must set resolveImmediately: true`);
    if (!Array.isArray(c.variants) || c.variants.length !== 1) {
      fail(`${ctx}: practice case must have exactly 1 variant`);
    }
  } else if (!Array.isArray(c.variants) || c.variants.length < 1) {
    // relaxed from "exactly 3" — this deployment doesn't use round-robin
    // variant assignment, every trainee in a cohort sees the same content
    // (build spec §2.2), so a halt case just needs at least one variant.
    fail(`${ctx}: halt case must have at least 1 variant`);
  }
  c.variants.forEach((v) => {
    const vctx = `${ctx} variant ${v && v.variant}`;
    if (typeof v.variant !== 'number') fail(`${vctx}: missing variant number`);
    if (!Array.isArray(v.dispatch) || v.dispatch.length === 0) {
      fail(`${vctx}: missing dispatch lines`);
    }
    if (typeof v.scene !== 'string' || !v.scene) fail(`${vctx}: missing scene`);
    const sp = v.situation_panel;
    if (!Array.isArray(sp) || sp.length === 0 || sp.some((f) => !f || !f.label || typeof f.value === 'undefined')) {
      fail(`${vctx}: situation_panel must be a non-empty array of {label, value}`);
    }
    if (!Array.isArray(v.assessments) || v.assessments.length === 0) {
      fail(`${vctx}: missing assessments`);
    }
    v.assessments.forEach((a) => {
      if (typeof a.id === 'undefined' || !a.label || !a.result) {
        fail(`${vctx}: assessment missing id/label/result`);
      }
    });
    if (typeof v.bhau_scene_line !== 'string' || !v.bhau_scene_line) {
      fail(`${vctx}: missing bhau_scene_line`);
    }
    if (!Array.isArray(v.options) || v.options.length !== 3) {
      fail(`${vctx}: must have exactly 3 options`);
    }
    const ids = v.options.map((o) => o.id).sort().join('');
    if (ids !== 'ABC') fail(`${vctx}: options must be A, B, C`);
    v.options.forEach((o) => {
      if (!o.text) fail(`${vctx}: option ${o.id} missing text`);
    });
    if (kind === 'halt') {
      if (typeof v.halt_line !== 'string' || !v.halt_line) {
        fail(`${vctx}: missing halt_line`);
      }
      if (typeof v.halt_prelude !== 'string' || !v.halt_prelude) {
        fail(`${vctx}: missing halt_prelude`);
      }
    }
    const r = v.reveal;
    // practice cases have no doc-supplied setup line — empty string is honest, not a defect
    if (!r || typeof r.setup !== 'string' || !r.outcomes || !r.concept) {
      fail(`${vctx}: incomplete reveal block`);
    }
    if (!r.outcomes.A || !r.outcomes.B || !r.outcomes.C) {
      fail(`${vctx}: reveal.outcomes missing A/B/C`);
    }
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

  const haltCases = cases.filter((c) => (c.kind || 'halt') === 'halt');
  const haltIds = new Set(haltCases.map((c) => c.id));
  const practiceCases = cases.filter((c) => c.kind === 'practice');
  practiceCases.forEach((c) => {
    if (!haltIds.has(c.topic_id)) {
      fail(`case ${c.id}: topic_id ${c.topic_id} does not match any halt case id`);
    }
  });

  // Corporate self-paced model: there's no cohort-wide "current topic" or
  // "reveal unlocked" state to bootstrap — progression and reveal visibility
  // are both derived per-roll from the submissions table at request time
  // (see index.js's computeCurrentCaseId / /api/reveal). Seeding is pure
  // content validation now.
  console.log(
    `[seed] OK — validated ${cases.length} case(s) (${haltCases.length} halt, ${practiceCases.length} practice).`
  );
}

seed();
