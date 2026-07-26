const path = require('path');
const fs = require('fs');
const express = require('express');
const { db, statements } = require('./db');
const { getVariant } = require('./variant');

const PORT = process.env.PORT || 4000;
const TEACHER_SECRET = process.env.TEACHER_SECRET || 'quietfloor-secret';

const CASES_PATH = path.join(__dirname, 'data', 'cases.json');
const STRINGS_PATH = path.join(__dirname, 'data', 'strings.json');
const STRINGS_MR_PATH = path.join(__dirname, 'data', 'strings.mr.json');
const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf-8'));
const strings = JSON.parse(fs.readFileSync(STRINGS_PATH, 'utf-8'));
const stringsMr = fs.existsSync(STRINGS_MR_PATH)
  ? JSON.parse(fs.readFileSync(STRINGS_MR_PATH, 'utf-8'))
  : {};
const casesById = new Map(cases.map((c) => [c.id, c]));

const app = express();
app.use(express.json());

function resolveLang(req) {
  return req.query.lang === 'en' ? 'en' : 'mr';
}

function localizeTitle(caseObj, lang) {
  if (lang === 'mr' && caseObj.title_mr) return caseObj.title_mr;
  return caseObj.title;
}

// this deployment ships no Marathi translations (server/data/strings.mr.json
// and each variant's own translations block are both absent) — every field
// falls back to English, exactly as designed for partial-coverage content.
function localizeVariant(v, lang) {
  if (lang !== 'mr' || !v) return v;
  const mr = v.translations && v.translations.mr;
  if (!mr) return v;
  return {
    ...v,
    dispatch: mr.dispatch || v.dispatch,
    scene: mr.scene || v.scene,
    situation_panel: mr.situation_panel || v.situation_panel,
    assessments: v.assessments.map((a, i) => ({
      id: a.id,
      label: (mr.assessments && mr.assessments[i] && mr.assessments[i].label) || a.label,
      result: (mr.assessments && mr.assessments[i] && mr.assessments[i].result) || a.result,
      image: a.image,
    })),
    bhau_scene_line: mr.bhau_scene_line || v.bhau_scene_line,
    decision_intro: mr.decision_intro || v.decision_intro,
    options: v.options.map((o, i) => ({
      id: o.id,
      text: (mr.options && mr.options[i] && mr.options[i].text) || o.text,
    })),
    halt_prelude: mr.halt_prelude || v.halt_prelude,
    halt_line: mr.halt_line || v.halt_line,
    reveal: v.reveal
      ? {
          setup: (mr.reveal && mr.reveal.setup) || v.reveal.setup,
          outcomes: (mr.reveal && mr.reveal.outcomes) || v.reveal.outcomes,
          concept: (mr.reveal && mr.reveal.concept) || v.reveal.concept,
        }
      : v.reveal,
  };
}

// this deployment ships every halt case with exactly one variant and no
// round-robin assignment (build spec §2.2) — resolve straight to it instead
// of running the roll-derived getVariant() mod-3 pick, which would 404 on
// two-thirds of employee IDs once the "exactly 3 variants" validator was
// relaxed to "at least 1".
function resolveVariant(caseObj, kind, roll) {
  if (kind === 'practice') return 1;
  if (caseObj.variants.length === 1) return caseObj.variants[0].variant;
  return getVariant(roll);
}

// case-independent copy (Meera's frame text) — zero string literals in client components
app.get('/api/strings', (req, res) => {
  const lang = resolveLang(req);
  res.json(lang === 'mr' ? { ...strings, ...stringsMr } : strings);
});

// case titles, filterable by kind (teacher dashboard; default halt, unchanged from Phase 1)
app.get('/api/cases-list', (req, res) => {
  const kind = req.query.kind || 'halt';
  res.json(
    cases
      .filter((c) => (c.kind || 'halt') === kind)
      .map((c) => ({ id: c.id, title: c.title }))
  );
});

function stripHtml(str) {
  return String(str).replace(/<[^>]*>/g, '');
}

function findVariant(caseObj, variantNum) {
  return caseObj.variants.find((v) => v.variant === variantNum);
}

// 6.1 — playable case, zero reveal content
app.get('/api/case/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const roll = req.query.roll || '';
  const lang = resolveLang(req);
  const caseObj = casesById.get(id);
  if (!caseObj) return res.status(404).json({ error: 'case not found' });

  const kind = caseObj.kind || 'halt';
  const variant = resolveVariant(caseObj, kind, roll);
  const v = localizeVariant(findVariant(caseObj, variant), lang);
  if (!v) return res.status(404).json({ error: 'variant not found' });

  res.json({
    id: caseObj.id,
    title: localizeTitle(caseObj, lang),
    image: caseObj.image,
    kind,
    topic_id: caseObj.topic_id || null,
    resolveImmediately: !!caseObj.resolveImmediately,
    variant: v.variant,
    dispatch: v.dispatch,
    scene: v.scene,
    situation_panel: v.situation_panel,
    assessments: v.assessments.map((a) => ({ id: a.id, label: a.label, result: a.result, image: a.image || null })),
    bhau_scene_line: v.bhau_scene_line,
    decision_intro: v.decision_intro,
    options: v.options.map((o) => ({ id: o.id, text: o.text })),
    halt_line: v.halt_line || null,
    halt_prelude: v.halt_prelude || null,
  });
});

// VN vertical slice (vn_vertical_slice_spec.md) — reshapes existing case+variant
// content into a linear beat script. Same zero-reveal-content rule as /api/case.
function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildVnBeats(caseObj, v, kind, lang) {
  const beats = [];

  v.dispatch.forEach((line) => {
    beats.push({ type: 'dispatch', text: line });
  });

  // scene_image_overrides (optional, keyed by 0-based sentence index) lets a
  // case attach extra shots mid-scene — e.g. a close-up once the narration
  // zooms in on the anomaly — beyond the single establishing shot every case
  // already gets via caseObj.image on sentence 0. Purely data-driven so more
  // images/situations slot in later without touching this code.
  splitIntoSentences(v.scene).forEach((sentence, i) => {
    const beat = { type: 'narration', scene: true, text: sentence };
    if (i === 0) beat.bg = caseObj.image;
    else if (v.scene_image_overrides && v.scene_image_overrides[i]) beat.bg = v.scene_image_overrides[i];
    beats.push(beat);
  });

  beats.push({
    type: 'assessment_menu',
    options: v.assessments.map((a) => ({ id: a.id, label: a.label, result: a.result, image: a.image || null })),
  });

  beats.push({
    type: 'speech',
    speaker: 'Alan',
    portrait: 'alan_neutral.jpg',
    text: v.bhau_scene_line,
  });

  beats.push({
    type: 'decision',
    timed: true,
    portrait: 'alan_asking.jpg',
    prompt: v.decision_intro,
    options: v.options.map((o) => ({ id: o.id, text: o.text })),
  });

  beats.push({
    type: 'probe',
    speaker: 'Alan',
    portrait: 'alan_asking.jpg',
  });

  // practice cases resolve immediately (no halt gate, no reveal wait — same
  // rule as the classic flow's kind==='practice' branch) so there's no
  // cliffhanger content to show; the client jumps straight to Reveal instead.
  if (kind === 'halt') {
    beats.push({
      type: 'halt',
      bg: 'floor_wide.jpg',
      prelude: v.halt_prelude,
      text: v.halt_line,
    });
  }

  return beats;
}

app.get('/api/vn-script/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const roll = req.query.roll || '';
  const lang = resolveLang(req);
  const caseObj = casesById.get(id);
  if (!caseObj) return res.status(404).json({ error: 'case not found' });

  const kind = caseObj.kind || 'halt';
  const variant = resolveVariant(caseObj, kind, roll);
  const v = localizeVariant(findVariant(caseObj, variant), lang);
  if (!v) return res.status(404).json({ error: 'variant not found' });

  res.json({
    id: caseObj.id,
    title: localizeTitle(caseObj, lang),
    kind,
    variant: v.variant,
    situation_panel: v.situation_panel,
    beats: buildVnBeats(caseObj, v, kind, lang),
  });
});

// which cases this roll has already submitted (for Entry "handed over" state)
app.get('/api/submissions/:roll', (req, res) => {
  const roll = req.params.roll;
  const rows = db
    .prepare('SELECT case_id FROM submissions WHERE roll_number = ?')
    .all(roll);
  res.json({ submitted_case_ids: rows.map((r) => r.case_id) });
});

// topic display names — one per halt case, matching this deployment's own
// case titles 1:1 (no separate practice-case taxonomy exists here, see §1).
const TOPIC_NAMES = {
  1: 'THE QUIET FLOOR',
  2: 'EVERY LIGHT AT ONCE',
};

const TOPIC_NAMES_MR = {};

function localizeTopicName(topicId, lang) {
  const names = lang === 'mr' ? TOPIC_NAMES_MR : TOPIC_NAMES;
  return names[topicId] || `Topic ${topicId}`;
}

const haltCasesInOrder = cases
  .filter((c) => (c.kind || 'halt') === 'halt')
  .sort((a, b) => (a.topic_id || a.id) - (b.topic_id || b.id));

const practiceCasesByTopic = new Map();
cases
  .filter((c) => c.kind === 'practice')
  .forEach((c) => {
    const list = practiceCasesByTopic.get(c.topic_id) || [];
    list.push(c);
    practiceCasesByTopic.set(c.topic_id, list);
  });

// a case is only fully done once BOTH the decision and its escalation form
// are logged — a trainee who closes the tab right after submitting (before
// ever reaching "Log it") must land back on this same case, not skip past it.
function hasFullyClosed(roll, caseId) {
  if (!statements.getSubmission.get(roll, caseId)) return false;
  return !!statements.getEscalationSubmission.get(roll, caseId);
}

// Corporate self-paced model: no live facilitator gates a shared cohort
// pace. Each trainee simply moves through halt cases in order at their own
// speed — the first one they haven't yet fully closed out is "Tonight's
// Call" for them, and it advances the moment their own escalation form
// lands, independent of anyone else's progress.
function computeCurrentCaseId(roll) {
  const next = haltCasesInOrder.find((c) => !hasFullyClosed(roll, c.id));
  return next ? next.id : null;
}

// GET /api/depot?roll=XX — one round trip renders the whole home screen (§4.3)
app.get('/api/depot', (req, res) => {
  const roll = req.query.roll || '';
  const lang = resolveLang(req);
  if (!roll) return res.status(400).json({ error: 'roll required' });

  const currentCaseId = computeCurrentCaseId(roll);
  let currentCall = null;
  if (currentCaseId) {
    const haltCase = casesById.get(currentCaseId);
    const alreadySubmitted = !!statements.getSubmission.get(roll, currentCaseId);
    currentCall = {
      case_id: haltCase.id,
      title: localizeTitle(haltCase, lang),
      status: alreadySubmitted ? 'PENDING_LOG' : 'INCOMING',
    };
  }

  // dossier folders are purely a case-file shelf for practice-case review in
  // the original design; this deployment has none, so they're always open
  // and empty — kept for visual/UI parity, not load-bearing for progression.
  const folders = haltCasesInOrder.map((c) => {
    const topicId = c.topic_id || c.id;
    const ownCases = practiceCasesByTopic.get(topicId) || [];
    const reviewedCount = ownCases.filter((pc) => !!statements.getSubmission.get(roll, pc.id)).length;
    return {
      topic_id: topicId,
      title: localizeTopicName(topicId, lang),
      state: 'OPEN',
      progress: { reviewed: reviewedCount, total: ownCases.length },
    };
  });

  const submissions = statements.getSubmissionsForRoll.all(roll);
  const log = submissions
    .map((s) => {
      const caseObj = casesById.get(s.case_id);
      if (!caseObj) return null;
      const kind = caseObj.kind || 'halt';
      const variantObj = localizeVariant(
        caseObj.variants.find((v) => v.variant === s.variant) || caseObj.variants[0],
        lang
      );
      return {
        case_id: caseObj.id,
        title: localizeTitle(caseObj, lang),
        kind,
        option_chosen: s.option_chosen,
        justification: s.justification,
        outcome_line: variantObj.reveal.outcomes[s.option_chosen] || '',
        created_at: s.created_at,
      };
    })
    .filter(Boolean);

  res.json({ current_call: currentCall, folders, log });
});

// GET /api/folder/:topicId — practice case list for a topic. Always empty in
// this deployment (no practice cases exist yet), kept so the Depot's
// case-file panel has somewhere to fetch from without a 404.
app.get('/api/folder/:topicId', (req, res) => {
  const topicId = parseInt(req.params.topicId, 10);
  const roll = req.query.roll || '';
  const lang = resolveLang(req);
  const exists = haltCasesInOrder.some((c) => (c.topic_id || c.id) === topicId);
  if (!exists) return res.status(404).json({ error: 'topic not found' });

  const ownCases = practiceCasesByTopic.get(topicId) || [];
  res.json({
    state: 'OPEN',
    cases: ownCases.map((c) => ({
      id: c.id,
      title: localizeTitle(c, lang),
      label: null,
      reviewed: !!statements.getSubmission.get(roll, c.id),
    })),
  });
});

// 6.2 — submit
app.post('/api/submit', (req, res) => {
  const {
    roll_number,
    case_id,
    assessments_taken,
    option_chosen,
    justification,
    time_to_decision_ms,
  } = req.body || {};

  if (!roll_number || typeof roll_number !== 'string') {
    return res.status(400).json({ error: 'roll_number required' });
  }
  const caseId = parseInt(case_id, 10);
  if (!casesById.has(caseId)) {
    return res.status(400).json({ error: 'invalid case_id' });
  }
  if (!['A', 'B', 'C'].includes(option_chosen)) {
    return res.status(400).json({ error: 'option_chosen must be A, B, or C' });
  }
  const caseObj = casesById.get(caseId);
  const kind = caseObj.kind || 'halt';
  const cleanJustification = stripHtml(justification || '').trim().slice(0, 500);
  const variant = resolveVariant(caseObj, kind, roll_number);
  const timeMs = Math.min(Math.max(parseInt(time_to_decision_ms, 10) || 0, 0), 300000);
  const assessmentsJson = JSON.stringify(
    Array.isArray(assessments_taken) ? assessments_taken : []
  );

  const params = {
    roll_number,
    case_id: caseId,
    variant,
    assessments_taken: assessmentsJson,
    option_chosen,
    justification: cleanJustification,
    time_to_decision_ms: timeMs,
    kind, // server-derived from cases.json, never trusted from the client
  };

  const existing = statements.getSubmission.get(roll_number, caseId);
  if (existing) {
    statements.updateSubmission.run(params);
  } else {
    statements.insertSubmission.run(params);
  }

  res.json({ ok: true });
});

// 6.3 — halt revisit counter
app.post('/api/halt-revisit', (req, res) => {
  const { roll_number, case_id } = req.body || {};
  if (!roll_number || !case_id) return res.status(400).json({ error: 'roll_number and case_id required' });
  statements.incrementHaltRevisit.run(roll_number, parseInt(case_id, 10));
  res.json({ ok: true });
});

// 6.4 — reveal. Corporate self-paced model: a trainee's own submission is
// what unlocks their reveal, immediately — no separate facilitator gate.
// Practice cases (none exist yet) resolve immediately regardless.
app.get('/api/reveal/:caseId', (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const roll = req.query.roll || '';
  const lang = resolveLang(req);
  const caseObj = casesById.get(caseId);
  if (!caseObj) return res.status(404).json({ error: 'case not found' });

  const isPractice = (caseObj.kind || 'halt') === 'practice';
  const submission = statements.getSubmission.get(roll, caseId);
  if (!isPractice && !submission) {
    return res.json({ locked: true });
  }

  const matrix = caseObj.variants.map((raw) => {
    const v = localizeVariant(raw, lang);
    return {
      variant: v.variant,
      setup: v.reveal.setup,
      outcomes: v.reveal.outcomes,
      concept: v.reveal.concept,
    };
  });

  res.json({
    locked: false,
    matrix,
    your_choice: submission
      ? { variant: submission.variant, option_chosen: submission.option_chosen }
      : null,
  });
});

// escalation form (build spec §5) — appears after every reveal, regardless of
// which narrative option was chosen. Mirrors /api/submit's validation posture:
// category/impact/urgency/notify_group are checked against known enums,
// never trusted as free-form from the client.
const ESCALATION_CATEGORIES = ['Service Request', 'Access Request', 'Standard Change', 'Major Incident'];
const ESCALATION_LEVELS = ['Low', 'Medium', 'High', 'Extensive'];
const ESCALATION_URGENCY = ['Low', 'Medium', 'High', 'Critical'];
const ESCALATION_NOTIFY = ['WMS Engineering', 'Floor Operations', 'Peak Readiness Owner', 'No one — closing as routine'];

// Impact x Urgency -> Priority. No real ITSM logic needed (build spec §5.2) —
// mirrored in client/src/screens/EscalationForm.jsx for the live preview;
// this copy is the one that actually gets persisted.
const PRIORITY_MATRIX = {
  Low: { Low: 'Low', Medium: 'Low', High: 'Medium', Critical: 'Medium' },
  Medium: { Low: 'Low', Medium: 'Medium', High: 'Medium', Critical: 'High' },
  High: { Low: 'Medium', Medium: 'Medium', High: 'High', Critical: 'Critical' },
  Extensive: { Low: 'Medium', Medium: 'High', High: 'Critical', Critical: 'Critical' },
};

app.post('/api/escalation-submit', (req, res) => {
  const {
    roll_number,
    case_id,
    category,
    impact,
    urgency,
    notify_group,
    description,
    narrative_option_chosen,
  } = req.body || {};

  if (!roll_number || typeof roll_number !== 'string') {
    return res.status(400).json({ error: 'roll_number required' });
  }
  const caseId = parseInt(case_id, 10);
  if (!casesById.has(caseId)) {
    return res.status(400).json({ error: 'invalid case_id' });
  }
  if (!ESCALATION_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'invalid category' });
  }
  if (!ESCALATION_LEVELS.includes(impact)) {
    return res.status(400).json({ error: 'invalid impact' });
  }
  if (!ESCALATION_URGENCY.includes(urgency)) {
    return res.status(400).json({ error: 'invalid urgency' });
  }
  if (!ESCALATION_NOTIFY.includes(notify_group)) {
    return res.status(400).json({ error: 'invalid notify_group' });
  }
  if (narrative_option_chosen && !['A', 'B', 'C'].includes(narrative_option_chosen)) {
    return res.status(400).json({ error: 'invalid narrative_option_chosen' });
  }

  // priority is derived server-side from the validated impact/urgency pair,
  // never trusted as a client-computed value.
  const priority = PRIORITY_MATRIX[impact][urgency];
  const cleanDescription = stripHtml(description || '').trim().slice(0, 1000);

  statements.insertEscalationSubmission.run({
    roll_number,
    case_id: caseId,
    category,
    impact,
    urgency,
    priority,
    notify_group,
    description: cleanDescription,
    narrative_option_chosen: narrative_option_chosen || null,
  });

  res.json({ ok: true, priority });
});

// 6.5 — teacher endpoints. Under the self-paced model these are read-only
// aggregate views for a facilitator to watch cohort-wide stats — they no
// longer gate anything a trainee sees.
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

  const rows = statements.getSubmissionsForCase.all(caseId);
  const optionSplit = { A: 0, B: 0, C: 0 };
  const variantOptionGrid = {};
  const justificationsByOption = { A: [], B: [], C: [] };
  let totalTime = 0;
  let totalHaltRevisits = 0;

  rows.forEach((r) => {
    optionSplit[r.option_chosen] += 1;
    const key = `${r.variant}`;
    if (!variantOptionGrid[key]) variantOptionGrid[key] = { A: 0, B: 0, C: 0 };
    variantOptionGrid[key][r.option_chosen] += 1;
    justificationsByOption[r.option_chosen].push({
      roll_number: r.roll_number,
      variant: r.variant,
      justification: r.justification,
      resubmitted: !!r.resubmitted,
    });
    totalTime += r.time_to_decision_ms;
    totalHaltRevisits += r.halt_revisits;
  });

  res.json({
    case_id: caseId,
    title: caseObj.title,
    submissions_count: rows.length,
    option_split: optionSplit,
    variant_option_grid: variantOptionGrid,
    justifications_by_option: justificationsByOption,
    avg_time_to_decision_ms: rows.length ? Math.round(totalTime / rows.length) : 0,
    total_halt_revisits: totalHaltRevisits,
  });
});

// project-mode matrix (teacher only) — for displaying the outcome matrix to
// a group during a live discussion; always viewable, not gated on anything.
app.get('/api/teacher/:secret/reveal/:caseId', requireSecret, (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  const caseObj = casesById.get(caseId);
  if (!caseObj) return res.status(404).json({ error: 'case not found' });

  res.json({
    locked: false,
    matrix: caseObj.variants.map((v) => ({
      variant: v.variant,
      setup: v.reveal.setup,
      outcomes: v.reveal.outcomes,
      concept: v.reveal.concept,
    })),
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
