# Implementation 1 — Direct-edit fast path (skip the LLM for pure exact edits)

**Date/time:** 2026-07-25 10:21 EDT
**Branch:** feature/ui-refactor-v2
**Status:** implemented, tests green, **not committed** (per instruction)
**Scope guard:** this pass ONLY adds the direct-edit shortcut. No candidate/button
work, no Groq prompt restructuring, no explanation-on-demand changes beyond what
the shortcut path itself needs.

---

## 1. What this does

Before `handleGenerateProgression` calls Groq, the client now checks whether the
typed prompt is, in full, a single supported exact chord edit (e.g. "change
measure 2 to F"). If so, it applies the edit locally and returns — making **zero
network calls**: no `/api/interpret-style` (Groq #1) and no
`/api/explain-progression` (Groq #2). These edits now resolve in milliseconds
instead of 15–30s.

The safety property is **total-parse**: the shortcut fires only when the *entire*
prompt is the edit. Anything with leftover text — a style clause, a question, a
second sentence — fails the gate and falls through to the normal Groq path
unchanged. This is enforced structurally: every pattern is anchored `^...$`, so
"…and make it jazzier" cannot match. A mixed "make it jazzier AND change measure
2 to C" still goes to Groq (correct — it needs candidate generation), so no
clause is ever silently dropped.

Bias is deliberately toward **deferring**: if the parser is unsure (out-of-range
measure, unknown chord name, wrong chord count, same-measure copy), it returns
`null` and Groq handles it. Over-rejecting only costs one avoidable Groq call;
over-accepting would drop a clause, so we never do it.

---

## 2. Files touched

| File | Change |
|---|---|
| `src/harmony/directEditParser.ts` | **NEW.** Pure `parsePureDirectEdits(prompt, measureCount)` → `ChordEditAction[] \| null`. All regexes anchored for the total-parse guarantee. No React, no I/O — unit-testable in isolation. |
| `src/harmony/directEditParser.test.ts` | **NEW.** 13 cases: accepted phrasings + deferrals (mixed prompt, out-of-range, wrong count, invalid chord, question, empty). |
| `src/components/Staff.tsx` | Import `parsePureDirectEdits`. New `handleDirectEditShortcut(...)` (mirrors the revise path's apply+voice+render, but makes no network call and requests no explanation). Fast-path check inserted in `handleGenerateProgression` right after `previousProgression` is read, before the interpretation fetch. |

Reused (not modified): `harmony/actions.applyChordEdits` (the deterministic edit
engine), `applyRequestedActions`, `renderProgression`, `getGenerationKey`,
`toGenerationPreferences`. The shortcut is a new *entry point* into existing
machinery, not a parallel implementation — so there is no second edit path to
keep in sync.

**Verification:** `npm test` → 8 files / 57 tests pass. `npx tsc --noEmit` clean.

---

## 3. Regex phrases currently recognized (for manual testing)

All are case-insensitive, tolerate leading/trailing spaces and a trailing
`.`/`!`/`?`, and **require an existing progression on the staff** (generate one
first, then try these). `N`/`M` may be a digit (`2`), number word (`two`),
ordinal word (`second`), or `2nd`-style. Measure keyword may be `measure`,
`chord`, or `bar`.

**Single-measure edit** (verb ∈ change/set/make/replace/update, connector ∈
to/with/=):
- `change measure 2 to F`  ← the report's motivating case
- `set chord 3 to Am`
- `replace measure 1 with G7`
- `update bar 4 to Dm7`
- `change the 2nd chord to F`
- `change the second chord to F`
- `set chord two to Am`

**Copy a measure:**
- `copy measure 1 to measure 4`
- `copy the first chord to the fourth chord`

**Set the whole progression** (must name exactly `measureCount` chords; separators
`-`, `–`, `,`, or space; connector to/as/= is optional):
- `set the progression to F-G-C-G`
- `use progression F, G, C, G`
- `set the progression to F G C G`

**Should NOT shortcut (fall through to Groq)** — worth spot-checking these behave
exactly as before:
- `make it jazzier` (pure style)
- `make it jazzier and change measure 2 to C` (mixed → Groq builds candidates + edit)
- `change measure 9 to F` (out of range)
- `set the progression to F-G-C` (wrong count)
- `change measure 2 to H` (invalid chord)
- `why did you choose measure 2?` (question)

Chord vocabulary accepted by the name pattern (shared with the server route):
`[A-Ga-g][#b]?(?:maj|min|m|dim|o|°|dom)?7?` — e.g. `C, Dm, G7, Am, Cmaj7, Dm7,
Bdim`. Note: the final authority on a chord name is `buildNamedChord` in
`music/chords.ts`; the parser gate is intentionally a strict *subset* check.

---

## 4. Known limitations / issues for future consideration

1. **One edit per prompt only.** "change measure 1 to C and measure 2 to G" does
   NOT shortcut (the `^...$` anchor rejects the conjunction) — it goes to Groq.
   Multi-clause exact edits joined by "and" are deferred to a later pass; doing
   them safely means splitting on connectors and total-parsing each clause.

2. **Two chord-name regexes now exist** — one here (`CHORD` in
   `directEditParser.ts`), one in `app/api/interpret-style/route.ts`
   (`CHORD_NAME_PATTERN`), plus `isValidChordName` copies. They are kept
   deliberately identical for now. REPORT3.md §3.3/§8 flags extracting a single
   shared `harmony/chordSymbol.ts`; that is the natural next consolidation and
   would let the server route import the SAME parser to validate Groq's output
   (one authority, per PLANNING3 §3.5). Deferred to keep this pass small.

3. **Style/preferences are taken unchanged from the active interpretation.** A
   pure edit carries no style clause, so `handleDirectEditShortcut` re-voices with
   the current `aiInterpretation`'s preferences. If no interpretation exists yet
   (edit issued against a progression made via the blank-prompt/dropdown path),
   it falls back to `DEFAULT_INTERPRETED_STYLE`. Voicing should be stable, but
   worth an eyeball during manual testing that the edited measure's voicing looks
   consistent with its neighbors.

4. **No explanation is produced for shortcut edits.** Intentional and aligned
   with PLANNING3 §5.3/§13 ("no auto-explanation"). If the user later wants "why"
   for a shortcut edit, that depends on the on-demand explanation work (a
   separate future pass). Today the standard revise path still auto-explains; the
   shortcut simply doesn't.

5. **`aiInterpretation` is left as-is (not updated) after a shortcut edit.** The
   revise path calls `setAiInterpretation(...)`; the shortcut does not, because a
   pure edit changes no style/preference. Consequence: a subsequent explanation
   or revision reads the pre-edit interpretation summary. Harmless today, but
   note it once a history/undo layer or provenance metadata (PLANNING3 §13.2) is
   added — the edit is not currently recorded in interpretation state.

6. **No history entry is pushed** (there is no history layer yet, per REPORT3 §1).
   When undo/history lands, the shortcut path must push exactly one entry like the
   other edit paths — add it in `handleDirectEditShortcut`.

7. **Failure surfacing.** If `applyChordEdits` throws (e.g. `buildNamedChord`
   can't resolve a name the gate let through), `applyRequestedActions` sets
   `aiError` and returns the unchanged array; the shortcut detects the identical
   reference and returns without a false "Updated" message. The user sees the
   error but we skipped Groq. Acceptable, and rare given the name-pattern gate.

---

## 5. Notes to my future self (for later passes)

- **Where the seam is:** the fast path lives at the TOP of
  `handleGenerateProgression` (right after `const previousProgression = ...`).
  Everything below it is untouched legacy routing. When adding `direct_edit` as a
  first-class Groq intent later, the client parser stays as the *fast-path
  optimization* and the Groq `direct_edit` branch becomes the *fallback* for
  phrasings the regexes don't cover — they must produce the same
  `ChordEditAction[]` and both flow through `applyRequestedActions`.
- **The parser is pure and framework-free** on purpose, so the server route can
  import it verbatim when we unify parsers (limitation #2).
- **Latency wins still outstanding** (from REPORT3 §7, NOT done here): (1) make the
  auto-`await`ed explanation in `handleGenerateProgression`'s `finally` lazy for
  the *normal* path too; (2) add explicit `timeout` + `maxRetries` to both Groq
  clients. This pass only removes the LLM for *pure exact edits*; creative/mixed
  prompts still pay the double round-trip until those land.
- **Do not promise "exactly three" candidates later** (REPORT3 §4) — unrelated to
  this file but the next milestone.
