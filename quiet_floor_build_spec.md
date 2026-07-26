# THE QUIET FLOOR — Build Spec for Claude Code
## THG Ingenuity Escalation Training — Day 1 + Day 2, with the Escalation-Form layer
### Give this document to Claude Code together with a copy of the existing THE 108 codebase (server/, client/).

---

# 0. WHAT THIS IS, AND WHAT IT REUSES

This is not a new engine. It is two new cases plus one new screen, built on top of THE 108's existing architecture: Node/Express/SQLite server, React/Vite client, the visual-novel beat player, the topic/reveal gating system, and the teacher/facilitator dashboard. Everything about how a case plays (dispatch → scene → assessments → decision → commit → probe → halt → reveal) stays exactly as it already works. Three things are new: the case content itself, one schema generalization (the status panel), and one new screen that appears after the reveal (the escalation form).

**Important — this is a separate deployment, not an addition to the EMT product.** Fork the codebase into its own project. New `cases.json`, new SQLite database, new branding strings, own `TEACHER_SECRET`. This is a different client's training data and must not live in the same database or deployment as the EMT college product.

**Non-goals for this build (do not add):** roll-number-derived round-robin variant assignment (not used here — see §2), a facilitator/answer-review dashboard for the escalation form (see §5 — deferred, but persist the data now), Variant 3 ("The Access You Don't Have," designed previously, held for a later phase), any AI grading, any backend integration with a real ITSM tool.

---

# 1. THE TWO CASES, HOW THEY CHAIN

Two ordinary halt cases, in sequence, exactly like THE 108's existing topic system already supports:

- **Topic 1 / Case "The Quiet Floor"** — the trainee's first case. Correct answer: escalate (Option C).
- **Topic 2 / Case "Every Light at Once"** — only becomes the active "Tonight's Call" once Topic 1 is marked resolved by the facilitator. Correct answer: don't escalate (Option A) — the twist.

**This gating needs no new code.** THE 108's `computeCurrentTopicId()` (server/index.js) already returns the first unresolved topic in sequence, auto-advancing once a topic is resolved. Seed Topic 1 and Topic 2 in that order and the existing engine already enforces "Day 2 only appears after Day 1 is discussed and revealed" — the facilitator triggers this by hitting "Reveal in class" on Day 1's case, same button that already exists in the teacher dashboard, whenever the Day 1 discussion actually happens (same day or next day — the mechanism doesn't hardcode a delay, the facilitator controls timing).

Same-day reveal is the intended cadence here (not the overnight cliffhanger the EMT product uses) — the facilitator reveals Day 1 once the group has played it and discussed it, then Day 2 is available whenever the facilitator/cohort is ready to run it (next day is the intended default).

---

# 2. SCHEMA CHANGES REQUIRED

## 2.1 Status panel — generalize `patient_panel`

The existing schema hardcodes four fixed keys (`conscious`, `breathing`, `pulse`, `visible`) in both `seed.js`'s validator and `PatientPanel.jsx`'s renderer. Those labels don't fit an operations scenario. Replace with a flexible list:

```json
"situation_panel": [
  { "label": "Zone 4 status", "value": "Intermittent retry faults, no stoppage" },
  { "label": "Digital dashboards", "value": "All green — no customer-facing errors" },
  { "label": "Time since first fault", "value": "6 minutes" },
  { "label": "Recent change", "value": "Unconfirmed" }
]
```

Update `PatientPanel.jsx` (rename to `StatusPanel.jsx` if you like) to map over the array and render each `label`/`value` pair, instead of destructuring four fixed keys. Update `seed.js`'s validation to check that `situation_panel` is a non-empty array of `{label, value}` objects, rather than checking for the four named fields.

## 2.2 Variant count — relax the validator

`seed.js` currently requires exactly 3 variants for any `kind: "halt"` case (round-robin assignment by roll number, used in the EMT product to give different students different versions in the same class). This deployment doesn't use round-robin — every trainee in a cohort sees the same content on a given day. Relax the check to require **at least 1** variant for halt cases, not exactly 3. Each case below ships with exactly one variant.

## 2.3 Field names kept as-is

`bhau_scene_line`, `decision_intro`, `halt_prelude`, `halt_line`, and the `reveal.setup` / `reveal.outcomes` / `reveal.concept` fields are retained unchanged — they're generic content slots regardless of which mentor's line lives in them. No renaming needed; don't spend time on it.

---

# 3. CASE CONTENT — TOPIC 1: "THE QUIET FLOOR"

```json
{
  "id": 1,
  "title": "The Quiet Floor",
  "image": "floor_wide.jpg",
  "kind": "halt",
  "topic_id": 1,
  "variants": [
    {
      "variant": 1,
      "dispatch": [
        "21:42. Zone 4 AutoStore grid.",
        "Three failed retrieval attempts in the last six minutes.",
        "No hard fault code. No stoppage.",
        "Website and checkout dashboards: all green.",
        "Peak trading opens in three days."
      ],
      "scene": "Most of the floor is running clean — robots gliding along the grid, retrievals landing on schedule. In Zone 4, two units are pausing mid-retrieval and retrying instead of completing cleanly. A short line of totes is waiting on the conveyor a little longer than it should. No alarms are sounding. Nothing here reads as an emergency. It could be nothing.",
      "situation_panel": [
        { "label": "Zone 4 status", "value": "Intermittent retry faults, no stoppage" },
        { "label": "Digital dashboards", "value": "All green — no customer-facing errors" },
        { "label": "Time since first fault", "value": "6 minutes" },
        { "label": "Recent change", "value": "Unconfirmed" }
      ],
      "assessments": [
        { "id": 1, "label": "Check the other zones", "result": "Zones 1, 2, 3, and 5 are running clean. Only Zone 4 shows this pattern — for now." },
        { "id": 2, "label": "Check the digital dashboards", "result": "Website, checkout, and order confirmation: all green. A customer browsing right now would see nothing wrong." },
        { "id": 3, "label": "Check the change log", "result": "A firmware update was pushed to the Zone 4 robots two hours ago, ahead of peak-season load testing." }
      ],
      "bhau_scene_line": "Floor's quiet. Screens are quiet. Doesn't mean nothing's happening — it just means nothing's shown itself yet.",
      "decision_intro": "Alan: \"Floor says it's a blip. Screens say we're fine. Three days out from the biggest weekend of the year. What do you do?\"",
      "options": [
        { "id": "A", "text": "Keep an eye on it yourself through the shift — it's one zone, nothing's stopped, no need to make noise yet." },
        { "id": "B", "text": "Message the WMS engineer yourself, informally — ask them to take a look when they get a chance. No need to log anything." },
        { "id": "C", "text": "Raise it now as a Major Incident, through the proper process, even though nothing customer-facing is broken yet." }
      ],
      "halt_prelude": "Whatever you chose, the shift moves on. Zone 4 keeps doing what Zone 4 was doing.",
      "halt_line": "Handover complete. What Zone 4 becomes — that's for the debrief.",
      "reveal": {
        "setup": "By the early hours, the pattern in Zone 4 either stayed contained or didn't — and what happened next came down to what got raised, and when.",
        "outcomes": {
          "A": "By 4 a.m., the same fault reaches Zone 5 — identical robots, identical firmware, just on a delay. Totes back up faster than the floor can clear by hand. The peak-readiness call opens with 'we have a problem' instead of 'we caught something last night.' Identical hardware on identical firmware tends to fail identically, on its own timeline — a quiet zone is rarely only one zone.",
          "B": "The WMS engineer looks at it alone and rolls back part of the firmware change without telling anyone else on shift. Zone 4 clears — and Zone 2, which was fine ten minutes earlier, breaks, because nobody else knew a change had been made. The floor now has two problems and no one holding the full picture. An uncoordinated fix during a live situation removes the one thing an incident actually needs: someone who knows everything that's been tried.",
          "C": "The Major Incident is logged at 21:50. The WMS engineer, the floor lead, and the peak-readiness owner are looped in within the hour, while it's still one small zone. The firmware push is identified and paused platform-wide before it reaches Zone 5. Resolved before the next shift starts. This is exactly what the formal channel is for — not a siren, a way to get the right people looking at a small problem while it's still small."
        },
        "concept": "MAJOR INCIDENT ESCALATION doesn't wait for visible damage. The real criteria: does this need another team, could it reach a customer, has it gone unresolved for a while — and Zone 4, at 21:42, already met one of the three."
      }
    }
  ]
}
```

**Correct answer: C.** Correct escalation-form category: **Major Incident.**

---

# 4. CASE CONTENT — TOPIC 2: "EVERY LIGHT AT ONCE" (the twist)

```json
{
  "id": 2,
  "title": "Every Light at Once",
  "image": "floor_alarm.jpg",
  "kind": "halt",
  "topic_id": 2,
  "variants": [
    {
      "variant": 1,
      "dispatch": [
        "21:45. Zones 2 and 3.",
        "Every unit reporting a fault alert within the same ninety seconds.",
        "Floor display is a wall of red.",
        "Two floor staff already gathered at the panel."
      ],
      "scene": "It looks like the big one. Alarms audible across the section. More noise, all at once, than Zone 4 ever made three nights ago.",
      "situation_panel": [
        { "label": "Zones 2 & 3 status", "value": "Simultaneous fault alerts, all units" },
        { "label": "Floor display", "value": "Wall of red" },
        { "label": "Maintenance calendar", "value": "Unconfirmed" },
        { "label": "Digital dashboards", "value": "All green" }
      ],
      "assessments": [
        { "id": 1, "label": "Check the maintenance calendar", "result": "This exact pattern is logged every Tuesday at this time — a scheduled recalibration cycle across Zones 2 and 3." },
        { "id": 2, "label": "Time the alerts", "result": "Already clearing. Three of the original units are back to normal within the last minute." },
        { "id": 3, "label": "Check the digital dashboards", "result": "Website, checkout, order confirmation: all green, same as always." }
      ],
      "bhau_scene_line": "Loud's not the same as urgent. Alan taught you that on a quiet zone. Same rule, louder room.",
      "decision_intro": "Alan: \"Every light on that board is red. Feels like the last one, doesn't it? Is it?\"",
      "options": [
        { "id": "A", "text": "Confirm it against the maintenance calendar and stand down — this is the scheduled cycle, not an incident." },
        { "id": "B", "text": "Raise it as a Major Incident now — this many alerts at once is too big to sit on." },
        { "id": "C", "text": "Message the floor engineer informally to keep watching, without logging anything yet." }
      ],
      "halt_prelude": "The board's still red for a few more seconds. Whatever you chose is already moving.",
      "halt_line": "Handover complete. What that call cost — that's for the debrief.",
      "reveal": {
        "setup": "Zones 2 and 3 finished their scheduled cycle four minutes after the first alert, exactly as logged. Nothing about tonight was ever broken.",
        "outcomes": {
          "A": "Confirmed against the calendar, stood down. Correct — and it cost nothing. The scheduled cycle finished on time, same as every Tuesday.",
          "B": "Four people paged out of bed for a routine recalibration that was already resolving itself. The cost isn't zero just because it wasn't a real incident — it's paid later, when the next genuine 21:42-style page gets a slower response, because this one cried wolf.",
          "C": "An informal ping doesn't fix anything here either — there was nothing to fix — but it also means nobody checked the one thing that would have actually answered the question: the calendar. Right instinct not to panic, wrong way to confirm it."
        },
        "concept": "The criteria for a Major Incident are about real signal — customer risk, a genuine need for another team, time actually unresolved — not about how many red lights are on the board at once. Zone 4 three nights ago was quiet and real. Tonight is loud and nothing. Same three questions, asked properly, get you the right answer either time."
      }
    }
  ]
}
```

**Correct answer: A.** Correct escalation-form category: **not** Major Incident (Service Request / routine close-out — see §5).

---

# 5. THE NEW LAYER: THE ESCALATION FORM

## 5.1 Where it lives in the flow

Currently, `machine.js`'s reducer treats `REVEAL` as a terminal phase — the trainee sees the outcome and that's the end of the case. Add one new phase, `ESCALATION_FORM`, reached from `REVEAL` via a "Log it" button (bridging line from Alan: *"Whatever happened on the floor tonight — the building needs to know properly. Let's log it right."*). Build a new component, e.g. `client/src/screens/EscalationForm.jsx`, styled to resemble a real incident-management ticket screen — reference two or three actual screenshots of the target ITSM tool's incident-creation form for field layout and visual accuracy; don't design this from a generic guess.

This screen appears after **every** reveal, regardless of which option the trainee chose in the story — the procedural skill (correctly logging what actually happened) is universal, not a reward for guessing right.

## 5.2 Form fields

- **Title / Subject** — free text
- **Category** — dropdown: `Service Request`, `Access Request`, `Standard Change`, `Major Incident` (fixed order is fine; the trainee must pick correctly among real distractors, not the only option)
- **Impact** — dropdown: `Low`, `Medium`, `High`, `Extensive`
- **Urgency** — dropdown: `Low`, `Medium`, `High`, `Critical`
- **Priority** — auto-derived, read-only, from a simple Impact × Urgency lookup table (no real ITSM logic needed — a small hardcoded matrix in the component is sufficient)
- **Description** — free text
- **Notify / Escalate to** — select: `WMS Engineering`, `Floor Operations`, `Peak Readiness Owner`, `No one — closing as routine`
- **Submit** — confirms with a simple message: *"Logged. Priority: [x]. [Groups] notified."* (or, for the routine-close path, *"Logged and closed. No escalation."*)

## 5.3 What "correct" looks like, per case (for future scoring/analysis — see §6)

| | Topic 1 (Quiet Floor) | Topic 2 (Every Light at Once) |
|---|---|---|
| Correct category | Major Incident | Service Request (or equivalent non-incident close-out) |
| Expected notify | WMS Engineering + Floor Operations (+ Peak Readiness Owner) | No one — closing as routine |

## 5.4 Persistence

No live ITSM integration and no review UI are being built now (see §6) — but persist every submission properly so nothing needs retrofitting later. New table, e.g.:

```sql
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
```

New endpoint `POST /api/escalation-submit`, same validation posture as the existing `/api/submit` (validate category/impact/urgency against the known enums server-side, never trust free-form values into those fields).

---

# 6. EXPLICITLY DEFERRED (do not build now)

- **Answer-review layer.** Eventually, a facilitator needs to see what trainees actually selected on the escalation form — category chosen (and whether it matched §5.3's correct answer), Impact/Urgency, who got notified, cross-referenced with their narrative choice — both per-trainee and aggregated across the cohort (e.g. "40% picked Service Request when they should have picked Major Incident"). A Google Sheet is a reasonable first version of this; a small dashboard (extending the existing teacher dashboard pattern) is the natural next step. Not part of this build. The only requirement now is that §5.4's persistence makes this possible later without re-doing anything.
- **Variant 3 ("The Access You Don't Have").** Designed in the earlier POC document. Third day / later phase.
- **Round-robin variant assignment.** Not used in this deployment (see §2.2).

---

# 7. IMAGES NEEDED

Six assets, generation-ready descriptions for an AI image/video tool (e.g. Google Flow). Brand safety: keep any packaging/branding in frame generic or fictional — do not depict real client logos.

1. **`floor_wide.jpg`** — Calm, well-lit automated fulfilment warehouse at night, AutoStore-style robotic grid stretching into the middle distance, robots gliding along the top retrieving bins. Ambient blue-white industrial lighting. A wall-mounted digital sign in the background shows a peak-season countdown. Photorealistic, wide angle, slightly elevated vantage point, orderly and calm — nothing dramatic.
2. **`zone4_anomaly.jpg`** — Medium close-up in the same grid: one robot paused mid-retrieval at a cell, a single amber (not red) indicator lit, a short queue of totes waiting slightly too long on a conveyor beside it. Background continues moving normally, out of focus. Subtly "off," not alarming.
3. **`alan_neutral.jpg`** — Photorealistic portrait, man in his mid-to-late 50s, weathered but calm expression, short grey hair, hi-vis vest over a plain work shirt, soft-focus warehouse office/floor backdrop. Neutral, steady, mid-conversation.
4. **`alan_asking.jpg`** — Same man, tighter chest-up framing, head slightly tilted, direct but not unkind expression — the moment of asking a pointed question. Same wardrobe/setting for continuity.
5. **`dashboards_green.jpg`** — Close shot of a wall-mounted or desk monitor showing a clean modern status dashboard, several metric tiles and a small line chart, all green and white, no errors. Shot at a slight angle so the warehouse floor is faintly visible, out of focus, behind the monitor.
6. **`floor_alarm.jpg`** — The same warehouse grid, a different section (Zones 2 & 3) with multiple robots simultaneously showing red fault indicators, a wall display lit up red, visually louder and more alarming than `zone4_anomaly.jpg`, for contrast. Two figures in hi-vis gathered near a control panel in the middle distance.

**Not an image:** the escalation-form screen. That's a coded UI component (§5), built from real ITSM screenshots, not generated artwork.

---

# 8. ACCEPTANCE CHECKLIST

- [ ] Fresh deployment: own database, own `cases.json`, own `TEACHER_SECRET`, no shared data with the EMT product
- [ ] `situation_panel` renders as a generic label/value list; `seed.js` validates it as such, not against the four old EMT-specific keys
- [ ] `seed.js` accepts halt cases with 1 variant (round-robin 3-variant requirement relaxed)
- [ ] Topic 1 plays start to finish: dispatch → scene → 3 assessments (each costs time) → decision (A/B/C, irreversible commit) → probe → halt
- [ ] Topic 2 does **not** appear as "Tonight's Call" until Topic 1 is marked resolved by the facilitator
- [ ] Reveal for both topics shows the correct per-option outcome text and names the concept
- [ ] After reveal (either topic, any option chosen), the Escalation Form phase appears — never skipped, never gated on having chosen "correctly" in the story
- [ ] Escalation Form: Category dropdown includes real distractors, not just "Major Incident"; Impact × Urgency correctly derives a displayed Priority; Notify field offers the "no one — routine" option
- [ ] Submission POSTs to `/api/escalation-submit` and lands in `escalation_submissions`, including which narrative option was chosen for that case
- [ ] No reveal content (either topic) ships to the client before the facilitator unlocks it — verify by inspecting the case/vn-script response payloads directly
- [ ] Facilitator dashboard shows both topics, their option splits, and justifications, same as the existing pattern

---

# 9. BUILD ORDER

1. Fork the codebase into a new project; strip/replace EMT-specific branding and content.
2. Generalize `situation_panel` (§2.1) and relax the variant-count validator (§2.2).
3. Transcribe Topic 1 and Topic 2 into the new `cases.json` verbatim from §3–§4.
4. Confirm topic auto-advance gating works with zero new code (§1) — play Topic 1, reveal it, confirm Topic 2 becomes available.
5. Add the `ESCALATION_FORM` phase to `machine.js` and build `EscalationForm.jsx` (§5), working from real ITSM screenshots for the visual layer.
6. Add the `escalation_submissions` table and `/api/escalation-submit` endpoint (§5.4).
7. Drop in the six images (§7) once generated.
8. Run the acceptance checklist (§8) end to end, on a real phone, before calling it done.
