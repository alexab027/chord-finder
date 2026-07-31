import Groq from "groq-sdk";
import {
  ALLOWED_STYLES,
  DEFAULT_INTERPRETED_STYLE,
  type HarmonyIntent,
  type HarmonyRouterResponse,
  type InterpretedStyle,
  type PendingClarification,
  type RevisionIntent,
} from "@/src/ai/types";
import {
  GROQ_HARMONY_ROUTER_SCHEMA,
  GROQ_HARMONY_ROUTER_SCHEMA_NAME,
  type GroqHarmonyRouterOutput,
} from "@/src/ai/harmonyRouterSchema";
import type { StyleOption } from "@/src/music/types";
import type {
  ChordEditAction,
  HarmonyChordQuality,
} from "@/src/harmony/actions";
import { CHORD_SYMBOL } from "@/src/harmony/chordSymbol";

const MAX_PROMPT_LENGTH = 500;
const MAX_KEY_LENGTH = 40;
const MAX_SUMMARY_LENGTH = 240;
const MAX_MOOD_ITEMS = 5;
const MAX_MOOD_LENGTH = 40;
const MAX_PROGRESSION_MEASURES = 4;
const MAX_SYMBOL_LENGTH = 40;
// The staff is a fixed four measures; chord-edit actions address measures 1-4.
const STAFF_MEASURE_COUNT = 4;
const MAX_ACTIONS = 8;
const ALLOWED_QUALITIES: HarmonyChordQuality[] = [
  "major",
  "minor",
  "dominant",
  "diminished",
];
const SUPPORTED_ACTION_TYPES = [
  "copy_chord",
  "set_chord",
  "replace_chord",
] as const;

const CHORD_NAME_PATTERN = CHORD_SYMBOL;

type CurrentProgressionItem = {
  measure: number;
  absoluteSymbol: string;
  romanNumeral: string;
};

// Shared, appended to both prompts. Lets the model express EXACT chord requests
// as a small action list. It never returns chord pitch names — only scale
// degree + quality (+ nullable 7th) + measure, which the engine resolves
// deterministically against the current key.
const ACTIONS_INSTRUCTIONS = `Exact chord edits ("actions"):
- Also return an "actions" array. Use it ONLY for supported chord edits the user explicitly names; otherwise return "actions": [].
- To set a specific chord at a measure, use scale degree (1-7) + quality:
  { "type": "set_chord", "measure": <1-4>, "degree": <1-7>, "quality": "major"|"minor"|"dominant"|"diminished", "extension": 7 }
  Use "extension": null for a plain triad; use "extension": 7 for a seventh chord.
- To replace a measure with a literal chord name like "Am", "C", "G7", or "Dm7", use:
  { "type": "replace_chord", "measure": <1-4>, "chordName": "Am" }
- To make one measure's chord identical to another's (e.g. "make the first and last chord the same"), use:
  { "type": "copy_chord", "fromMeasure": <1-4>, "toMeasure": <1-4> }
- Roman-numeral mapping: degree 1 = i/I, ... degree 7. "imin7" = degree 1, quality "minor", extension 7. "ivmin7" = degree 4, quality "minor", extension 7. "Vdom7" = degree 5, quality "dominant", extension 7.
- Do NOT approximate literal chord names with scale degrees. If the user says "Am", use replace_chord with "chordName": "Am".
- Do NOT return unsupported action types such as transpose_progression, transpose_chord, shift_voicing, or change_quality.
- Do NOT default "current chord" to a measure. There is no selected chord in the app. Ask which chord/measure instead.
- Only return these action fields: type, measure, degree, quality, extension, fromMeasure, toMeasure, chordName.
- measure, degree, fromMeasure, and toMeasure are 1-based.`;

const ROUTER_SYSTEM_PROMPT = `You are a harmony request interpreter for a chord-generation application. You classify the user's message before the application performs any operation. You do NOT compose music, edit rendered notes, or claim that a change was made.

Rules:
- Return ONLY a JSON object. No prose, no markdown.
- "intent" must be exactly one of: "generate_new", "revise_existing", "clarify", "answer_question".
- "confidence" must be a number between 0 and 1.
- "primaryStyle" must be exactly one of: "simple", "jazzy". Use no other value.
- Do not generate a progression. Do not invent chord names for generation or revision; for answer_question, you may repeat absolute chord symbols supplied in currentProgression.
- Use "generate_new" when the user explicitly requests a new progression:
  "generate a progression", "make me a progression", "give me a new
  progression", "start over", or "something completely different".
- The word "make" alone does not imply generate_new.
- When hasExistingProgression is true, phrases such as "make it simple",
  "make it simpler", "make this jazzy", and "make it jazzier" mean
  revise_existing.
- Comparative style words ending in "-er", such as "simpler" and "jazzier",
  mean revise_existing unless the user explicitly requests a new or completely
  different progression.
- If pendingClarification exists, the latest user message resolves it. If the latest message says "new progression", "make a new progression", "generate one", "start over", or similar, return "generate_new" even if the original ambiguous request could have been a revision.
- Use "revise_existing" when the user asks to change the currently displayed progression or an explicitly numbered chord.
- If pendingClarification exists and the latest user message says "existing progression", "the current progression", "that progression", or names a concrete existing-progression edit, return "revise_existing".
- If the user asks to transpose "the entire progression" or "the whole progression", the target is not ambiguous; however transposition actions are not supported yet, so return "clarify" with a focused message saying progression transposition is not supported yet. Do not ask whether they meant one chord.
- If the user says "current chord" or "selected chord", return "clarify" asking which chord/measure because this app has no selected chord state.
- If the user asks to make the progression major/minor or change key/mode through chat (e.g. "make it a major progression"), return "clarify" explaining key/mode changes are not supported through this request yet and asking whether they want to use the mode control or generate a new progression with the current active key.
- Use "clarify" when:
  - two or more materially different musical interpretations remain plausible;
  - an exact edit is missing a chord, measure, or other required value;
  - two exact edits conflict by assigning different results to the same measure;
  - any requested clause uses an unsupported operation;
  - any meaningful clause cannot be represented by the returned revision and actions.
- Every meaningful clause must be represented by the intent, revision, or actions.
- If any clause is unsupported, invalid, conflicting, or unhandled, return
  "clarify" with "actions": []. Never execute only the supported part of a
  multi-clause request.
- Use "answer_question" when the user asks about the current progression and no musical change should happen.
- If the user asks to revise an existing progression but none exists, still classify as "revise_existing"; the application will guard it.
- For "revise_existing", include a "revision" object. For every other intent, use "revision": null.
- For "clarify", include a concise "clarificationQuestion". For every other intent, use "clarificationQuestion": null.
- For "answer_question", include a concise "assistantMessage". For every other intent, use "assistantMessage": null. If there is no progression context, say that there is not enough progression to answer.
- For "answer_question", use currentProgression.absoluteSymbol for ordinary chord names and currentProgression.romanNumeral for harmonic function. Both are trusted application context.
- Distinguish harmonic transposition from voicing movement. "Transpose up two" is ambiguous; return "clarify". Do not return unsupported transposition or voicing actions.
- Do not return an exact-edit action unless it is supported by the exact chord edits schema below.
- Map simple / pop / clean / basic language toward "simple".
- Map jazz / lush / sophisticated / colorful language toward "jazzy".
- For explicit "descending bass", "descending bass line", or "descending bassline" requests, set "descendingBassWeight" to 1.0.
- Increase "descendingBassWeight" for falling, walking-down, or descending bass requests.
- Lower "dissonanceTolerance" for safe, smooth, or consonant requests.
- Raise "dissonanceTolerance" for tense, surprising, or experimental requests.
- Raise "cadenceStrength" for resolved, satisfying, or strong-ending requests.
- Raise "melodyFitPriority" and "consonancePriority" for safe, melody-supporting, or ordinary requests.
- Keep "playabilityRequired" true unless the user explicitly requests impractical or extreme spacing.

All numeric fields are between 0 and 1. Respond with exactly this shape:
{
  "intent": "generate_new",
  "confidence": 0.95,
  "primaryStyle": "simple",
  "melodyFitPriority": 1.0,
  "consonancePriority": 0.9,
  "descendingBassWeight": 0.0,
  "complexity": 0.0,
  "dissonanceTolerance": 0.0,
  "cadenceStrength": 0.0,
  "preferSevenths": false,
  "preferSuspensions": false,
  "voiceLeadingPriority": 0.75,
  "playabilityRequired": true,
  "mood": [],
  "summary": "",
  "revision": null,
  "actions": [],
  "clarificationQuestion": null,
  "assistantMessage": null
}

Revision settings:
- "revision.preserveOverallProgression": true to keep the same general progression, false to allow broad replacement.
- "revision.preserveChordPositions": array of measure numbers the user explicitly wants kept the same (e.g. "keep the first two chords" -> [1, 2]). Empty if none.
- "revision.changeAmount": 0 for a tiny tweak, 0.5 for moderate, 1 for a large change.
- "revision.requestedChanges": always include all four delta fields. Use a numeric delta in [-1, 1] when requested and null when not requested. Positive means more, negative means less:
  - "complexityDelta": "more complex / richer / add color" positive; "simpler" negative.
  - "dissonanceDelta": "more tense / dissonant" positive; "smoother / less dissonant" negative.
  - "descendingBassDelta": "make the bass descend more" positive.
  - "cadenceDelta": "stronger / more resolved ending" positive.

${ACTIONS_INSTRUCTIONS}`;

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function clampDelta(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(-1, value));
}
function asksForExplicitNewProgression(prompt: string) {
  return (
    /\bnew progression\b/i.test(prompt) ||
    /\bstart over\b/i.test(prompt) ||
    /\bsomething completely different\b/i.test(prompt) ||
    /\bgenerate one\b/i.test(prompt) ||
    /\bmake me a progression\b/i.test(prompt)
  );
}
function isExistingStyleRevision(
  prompt: string,
  hasExistingProgression: boolean,
) {
  if (!hasExistingProgression) return false;
  if (asksForExplicitNewProgression(prompt)) return false;

  return /\bmake\s+(?:it|this|that)\s+(?:simple|simpler|jazzy|jazzier)\b/i.test(
    prompt,
  );
}
export function sanitizeCurrentProgression(
  value: unknown,
): CurrentProgressionItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_PROGRESSION_MEASURES).flatMap((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const measure = item.measure;
    const romanNumeral =
      typeof item.romanNumeral === "string"
        ? item.romanNumeral.trim().slice(0, MAX_SYMBOL_LENGTH)
        : "";
    const absoluteSymbol =
      typeof item.absoluteSymbol === "string"
        ? item.absoluteSymbol.trim().slice(0, MAX_SYMBOL_LENGTH)
        : romanNumeral;
    if (
      typeof measure !== "number" ||
      !Number.isFinite(measure) ||
      !romanNumeral ||
      !absoluteSymbol
    ) {
      return [];
    }
    return [{ measure, absoluteSymbol, romanNumeral }];
  });
}

function sanitizePendingClarification(
  value: unknown,
): PendingClarification | null {
  const data = (value ?? {}) as Record<string, unknown>;
  const originalMessage =
    typeof data.originalMessage === "string"
      ? data.originalMessage.trim().slice(0, MAX_PROMPT_LENGTH)
      : "";
  const question =
    typeof data.question === "string"
      ? data.question.trim().slice(0, MAX_SUMMARY_LENGTH)
      : "";
  if (!originalMessage || !question) return null;

  const possibleIntents = Array.isArray(data.possibleIntents)
    ? data.possibleIntents
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 40))
        .filter(Boolean)
        .slice(0, 4)
    : undefined;

  return {
    originalMessage,
    question,
    ...(possibleIntents && possibleIntents.length > 0
      ? { possibleIntents }
      : {}),
  };
}

function includesTransposeRequest(
  prompt: string,
  pendingClarification: PendingClarification | null,
) {
  const combined = `${pendingClarification?.originalMessage ?? ""} ${prompt}`
    .toLowerCase()
    .trim();

  return (
    /\btranspose\b/.test(combined) ||
    (/\b(up|down)\b/.test(combined) &&
      /\b(semitone|semitones|half step|half-step)\b/.test(combined))
  );
}

function asksForCurrentChord(prompt: string) {
  return /\b(current|selected)\s+chord\b/i.test(prompt);
}

function asksForWholeProgression(prompt: string) {
  return /\b(entire|whole|full|current|existing)\s+progression\b/i.test(prompt);
}

function asksForModeChange(prompt: string) {
  return /\b(make|turn|change|convert|set)\b.*\b(major|minor)\s+progression\b/i.test(
    prompt,
  );
}

function asksForExplicitDescendingBass(prompt: string) {
  return /\bdescending\s+bass(?:\s*line|line)?\b/i.test(prompt);
}

function unsupportedActionTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw) => {
    const type = (raw ?? {}) as Record<string, unknown>;
    if (typeof type.type !== "string") return [];
    return SUPPORTED_ACTION_TYPES.includes(
      type.type as (typeof SUPPORTED_ACTION_TYPES)[number],
    )
      ? []
      : [type.type];
  });
}

function parseMeasureToken(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const numberWords: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
  };
  const parsed = numberWords[normalized] ?? Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function isValidChordName(value: string) {
  return new RegExp(`^${CHORD_NAME_PATTERN}$`).test(value.trim());
}

type NamedChordEdit =
  | { kind: "action"; action: ChordEditAction }
  | { kind: "clarify"; question: string };

function parseNamedChordTarget(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  const ordinals: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
    eighth: 8,
    ninth: 9,
  };
  return ordinals[normalized] ?? parseMeasureToken(normalized);
}

function parseExplicitNamedChordEdit(prompt: string): NamedChordEdit | null {
  const targetToken =
    "\\d+|one|two|three|four|five|six|seven|eight|nine|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth";
  const targetFirst = new RegExp(
    `^\\s*replace\\s+(?:the\\s+)?(${targetToken})\\s*(?:st|nd|rd|th)?\\s*(?:chord|measure)\\s+with\\s+(${CHORD_NAME_PATTERN})\\s*[.,!?]?\\s*$`,
    "i",
  ).exec(prompt);
  const chordFirst = new RegExp(
    `^\\s*(?:add|insert|set|replace)\\s+(?:a\\s+)?(${CHORD_NAME_PATTERN})(?:\\s+(somewhere|(?:in\\s+)?(?:measure|chord)\\s+(${targetToken})|as\\s+(?:the\\s+)?(${targetToken})\\s*(?:st|nd|rd|th)?\\s+chord))?\\s*[.,!?]?\\s*$`,
    "i",
  ).exec(prompt);

  const chordName = targetFirst?.[2] ?? chordFirst?.[1];
  if (!chordName || !isValidChordName(chordName)) return null;

  const rawTarget = targetFirst?.[1] ?? chordFirst?.[3] ?? chordFirst?.[4];
  if (!rawTarget) {
    return {
      kind: "clarify",
      question: "Which measure should be replaced with this chord?",
    };
  }

  const measure = parseNamedChordTarget(rawTarget);
  if (!measure || measure < 1 || measure > STAFF_MEASURE_COUNT) {
    return {
      kind: "clarify",
      question: `Measure ${rawTarget} is out of range. Which measure from 1-${STAFF_MEASURE_COUNT} should be replaced?`,
    };
  }

  return {
    kind: "action",
    action: { type: "replace_chord", measure, chordName },
  };
}

function extractExplicitCopyActions(prompt: string): ChordEditAction[] {
  const actions: ChordEditAction[] = [];
  const pattern =
    /\bcopy\s+chord\s+(\d+|one|two|three|four)\s+to\s+chord\s+(\d+|one|two|three|four)\b/gi;

  for (const match of prompt.matchAll(pattern)) {
    const fromMeasure = parseMeasureToken(match[1]);
    const toMeasure = parseMeasureToken(match[2]);
    if (
      fromMeasure &&
      toMeasure &&
      fromMeasure >= 1 &&
      fromMeasure <= STAFF_MEASURE_COUNT &&
      toMeasure >= 1 &&
      toMeasure <= STAFF_MEASURE_COUNT &&
      fromMeasure !== toMeasure
    ) {
      actions.push({ type: "copy_chord", fromMeasure, toMeasure });
    }
  }

  return actions;
}

function extractValidatedReplaceActions(prompt: string): ChordEditAction[] {
  const actions: ChordEditAction[] = [];
  const pattern = new RegExp(
    `\\b(?:replace|set|make)\\s+chord\\s+(\\d+|one|two|three|four)\\s+(?:with|to)\\s+(${CHORD_NAME_PATTERN})\\b`,
    "gi",
  );

  for (const match of prompt.matchAll(pattern)) {
    const measure = parseMeasureToken(match[1]);
    if (measure && measure >= 1 && measure <= STAFF_MEASURE_COUNT) {
      actions.push({
        type: "replace_chord",
        measure,
        chordName: match[2],
      });
    }
  }

  return actions;
}

function validateExplicitReplacementSyntax(prompt: string): string | null {
  const pattern =
    /\b(?:replace|set|make)\s+chord\s+(\S+)(?:\s+(?:with|to)\s*(\S*)?)?/gi;

  for (const match of prompt.matchAll(pattern)) {
    const rawMeasure = match[1];
    const measure = parseMeasureToken(rawMeasure);
    if (!measure || measure < 1 || measure > STAFF_MEASURE_COUNT) {
      return `Chord ${rawMeasure} is out of range. Choose chord 1-${STAFF_MEASURE_COUNT}.`;
    }

    const chordName = match[2]?.trim().replace(/[.,!?;:]+$/, "");
    if (!chordName) {
      return `Replacement for chord ${measure} is missing a chord name.`;
    }

    if (!isValidChordName(chordName)) {
      return `Chord name "${chordName}" is not valid. Use names like C, Dm, G7, or Am.`;
    }
  }

  return null;
}

function normalizeChordName(chordName: string) {
  return chordName
    .trim()
    .replace(/[.,!?;:]+$/, "")
    .toLowerCase();
}

function mergeLiteralReplaceActions(
  actions: ChordEditAction[],
  literalReplaceActions: ChordEditAction[],
) {
  if (literalReplaceActions.length === 0) return actions;

  return [
    ...actions.filter(
      (action) =>
        !literalReplaceActions.some((literal) => {
          if (literal.type !== "replace_chord") return false;
          if (action.type === "set_chord") {
            return literal.measure === action.measure;
          }
          if (action.type === "replace_chord") {
            return (
              literal.measure === action.measure &&
              normalizeChordName(literal.chordName) ===
                normalizeChordName(action.chordName)
            );
          }
          return false;
        }),
    ),
    ...literalReplaceActions,
  ];
}

function mergeExplicitCopyActions(
  actions: ChordEditAction[],
  explicitCopyActions: ChordEditAction[],
) {
  if (explicitCopyActions.length === 0) return actions;

  return [
    ...actions.filter((action) => action.type !== "copy_chord"),
    ...explicitCopyActions,
  ];
}

function sanitizeRevision(raw: unknown, measureCount: number): RevisionIntent {
  const data = (raw ?? {}) as Record<string, unknown>;

  const preserveChordPositions = Array.isArray(data.preserveChordPositions)
    ? Array.from(
        new Set(
          data.preserveChordPositions.filter(
            (n): n is number =>
              typeof n === "number" &&
              Number.isInteger(n) &&
              n >= 1 &&
              n <= measureCount,
          ),
        ),
      )
    : [];

  const requested = (data.requestedChanges ?? {}) as Record<string, unknown>;
  const requestedChanges: RevisionIntent["requestedChanges"] = {};
  const complexityDelta = clampDelta(requested.complexityDelta);
  const dissonanceDelta = clampDelta(requested.dissonanceDelta);
  const descendingBassDelta = clampDelta(requested.descendingBassDelta);
  const cadenceDelta = clampDelta(requested.cadenceDelta);
  if (complexityDelta !== undefined)
    requestedChanges.complexityDelta = complexityDelta;
  if (dissonanceDelta !== undefined)
    requestedChanges.dissonanceDelta = dissonanceDelta;
  if (descendingBassDelta !== undefined)
    requestedChanges.descendingBassDelta = descendingBassDelta;
  if (cadenceDelta !== undefined) requestedChanges.cadenceDelta = cadenceDelta;

  return {
    preserveOverallProgression:
      typeof data.preserveOverallProgression === "boolean"
        ? data.preserveOverallProgression
        : true,
    preserveChordPositions,
    changeAmount: clamp01(data.changeAmount, 0.3),
    requestedChanges,
  };
}

function isIntInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

// Validates every model action and rebuilds it from known fields.
// If any action is malformed, unsupported, or truncated, rejected is true so
// the request can clarify without applying only part of the requested edits.
type SanitizedActionsResult = {
  actions: ChordEditAction[];
  rejected: boolean;
};

function sanitizeActions(value: unknown): SanitizedActionsResult {
  if (!Array.isArray(value)) {
    return { actions: [], rejected: true };
  }

  const actions: ChordEditAction[] = [];
  let rejected = value.length > MAX_ACTIONS;

  for (const raw of value.slice(0, MAX_ACTIONS)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      rejected = true;
      continue;
    }

    const item = raw as Record<string, unknown>;

    if (item.type === "set_chord") {
      if (
        !isIntInRange(item.measure, 1, STAFF_MEASURE_COUNT) ||
        !isIntInRange(item.degree, 1, 7) ||
        typeof item.quality !== "string" ||
        !ALLOWED_QUALITIES.includes(item.quality as HarmonyChordQuality)
      ) {
        rejected = true;
        continue;
      }

      let extension: 7 | undefined;

      if (item.extension === undefined || item.extension === null) {
        extension = undefined;
      } else if (item.extension === 7) {
        extension = 7;
      } else {
        rejected = true;
        continue;
      }

      actions.push({
        type: "set_chord",
        measure: item.measure,
        degree: item.degree,
        quality: item.quality as HarmonyChordQuality,
        ...(extension === 7 ? { extension } : {}),
      });

      continue;
    }

    if (item.type === "copy_chord") {
      if (
        !isIntInRange(item.fromMeasure, 1, STAFF_MEASURE_COUNT) ||
        !isIntInRange(item.toMeasure, 1, STAFF_MEASURE_COUNT) ||
        item.fromMeasure === item.toMeasure
      ) {
        rejected = true;
        continue;
      }

      actions.push({
        type: "copy_chord",
        fromMeasure: item.fromMeasure,
        toMeasure: item.toMeasure,
      });

      continue;
    }

    if (item.type === "replace_chord") {
      if (
        !isIntInRange(item.measure, 1, STAFF_MEASURE_COUNT) ||
        typeof item.chordName !== "string"
      ) {
        rejected = true;
        continue;
      }

      const chordName = item.chordName.trim();

      if (
        chordName.length === 0 ||
        chordName.length > MAX_SYMBOL_LENGTH ||
        !isValidChordName(chordName)
      ) {
        rejected = true;
        continue;
      }

      actions.push({
        type: "replace_chord",
        measure: item.measure,
        chordName,
      });

      continue;
    }

    // Missing, non-string, and unsupported action types are rejected.
    rejected = true;
  }

  return { actions, rejected };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStyle(value: unknown): StyleOption {
  return ALLOWED_STYLES.includes(value as StyleOption)
    ? (value as StyleOption)
    : DEFAULT_INTERPRETED_STYLE.primaryStyle;
}

function asMood(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, MAX_MOOD_LENGTH))
    .filter((item) => item.length > 0)
    .slice(0, MAX_MOOD_ITEMS);
}

function asSummary(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_INTERPRETED_STYLE.summary;
  const trimmed = value.trim();
  if (trimmed.length === 0) return DEFAULT_INTERPRETED_STYLE.summary;
  return trimmed.slice(0, MAX_SUMMARY_LENGTH);
}

function asOptionalText(
  value: unknown,
  maxLength = MAX_SUMMARY_LENGTH,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function asIntent(value: unknown): HarmonyIntent | null {
  const allowed: HarmonyIntent[] = [
    "generate_new",
    "revise_existing",
    "clarify",
    "answer_question",
  ];
  return allowed.includes(value as HarmonyIntent)
    ? (value as HarmonyIntent)
    : null;
}

// Coerce an arbitrary parsed object into a safe InterpretedStyle, substituting
// defaults for anything missing or out of range.
function sanitizeInterpretation(raw: unknown): InterpretedStyle {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    primaryStyle: asStyle(data.primaryStyle),
    melodyFitPriority: clamp01(
      data.melodyFitPriority,
      DEFAULT_INTERPRETED_STYLE.melodyFitPriority,
    ),
    consonancePriority: clamp01(
      data.consonancePriority,
      DEFAULT_INTERPRETED_STYLE.consonancePriority,
    ),
    descendingBassWeight: clamp01(
      data.descendingBassWeight,
      DEFAULT_INTERPRETED_STYLE.descendingBassWeight,
    ),
    complexity: clamp01(data.complexity, DEFAULT_INTERPRETED_STYLE.complexity),
    dissonanceTolerance: clamp01(
      data.dissonanceTolerance,
      DEFAULT_INTERPRETED_STYLE.dissonanceTolerance,
    ),
    cadenceStrength: clamp01(
      data.cadenceStrength,
      DEFAULT_INTERPRETED_STYLE.cadenceStrength,
    ),
    preferSevenths: asBoolean(
      data.preferSevenths,
      DEFAULT_INTERPRETED_STYLE.preferSevenths,
    ),
    preferSuspensions: asBoolean(
      data.preferSuspensions,
      DEFAULT_INTERPRETED_STYLE.preferSuspensions,
    ),
    voiceLeadingPriority: clamp01(
      data.voiceLeadingPriority,
      DEFAULT_INTERPRETED_STYLE.voiceLeadingPriority,
    ),
    playabilityRequired: asBoolean(
      data.playabilityRequired,
      DEFAULT_INTERPRETED_STYLE.playabilityRequired,
    ),
    mood: asMood(data.mood),
    summary: asSummary(data.summary),
  };
}

function json(body: HarmonyRouterResponse, status = 200): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let prompt = "";
  let activeKey = "";
  let currentProgression: CurrentProgressionItem[] = [];
  let hasExistingProgression = false;
  let pendingClarification: PendingClarification | null = null;

  try {
    const body = (await request.json()) as {
      prompt?: unknown;
      message?: unknown;
      hasProgression?: unknown;
      hasExistingProgression?: unknown;
      activeKey?: unknown;
      currentProgression?: unknown;
      pendingClarification?: unknown;
    };
    const rawPrompt =
      typeof body?.message === "string" ? body.message : body?.prompt;
    prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
    activeKey =
      typeof body?.activeKey === "string"
        ? body.activeKey.trim().slice(0, MAX_KEY_LENGTH)
        : "";
    currentProgression = sanitizeCurrentProgression(body?.currentProgression);
    hasExistingProgression =
      (body?.hasProgression === true ||
        body?.hasExistingProgression === true) &&
      currentProgression.length > 0;
    pendingClarification = sanitizePendingClarification(
      body?.pendingClarification,
    );
  } catch {
    // Malformed JSON body: fall back to safe defaults rather than throwing.
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "generate_new",
      confidence: 1,
    });
  }

  // Empty prompt: deterministic defaults, no Groq call.
  if (prompt.length === 0) {
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "generate_new",
      confidence: 1,
    });
  }

  // Reject overly long prompts, but keep a usable response shape.
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json(
      {
        ...DEFAULT_INTERPRETED_STYLE,
        intent: "generate_new",
        confidence: 1,
        warning: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters; using default style.`,
      },
      400,
    );
  }

  const namedChordEdit = parseExplicitNamedChordEdit(prompt);
  if (namedChordEdit?.kind === "clarify") {
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "clarify",
      confidence: 1,
      actions: [],
      clarificationQuestion: namedChordEdit.question,
    });
  }
  if (namedChordEdit?.kind === "action") {
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "revise_existing",
      confidence: 1,
      actions: [namedChordEdit.action],
    });
  }

  const replacementSyntaxError = validateExplicitReplacementSyntax(prompt);
  if (replacementSyntaxError) {
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "clarify",
      confidence: 1,
      actions: [],
      clarificationQuestion: `${replacementSyntaxError} I did not change the chords.`,
    });
  }

  if (asksForModeChange(prompt)) {
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "clarify",
      confidence: 1,
      actions: [],
      clarificationQuestion:
        "Changing the active key or mode through this request is not supported yet. Do you want to use the Major/Minor mode control, or generate a new progression with the current active key?",
    });
  }

  if (includesTransposeRequest(prompt, pendingClarification)) {
    if (asksForCurrentChord(prompt)) {
      return json({
        ...DEFAULT_INTERPRETED_STYLE,
        intent: "clarify",
        confidence: 1,
        actions: [],
        clarificationQuestion:
          "Which chord or measure do you want to transpose? There is no selected chord right now.",
      });
    }

    if (
      asksForWholeProgression(prompt) ||
      asksForWholeProgression(pendingClarification?.originalMessage ?? "")
    ) {
      return json({
        ...DEFAULT_INTERPRETED_STYLE,
        intent: "clarify",
        confidence: 1,
        actions: [],
        clarificationQuestion:
          "Transposing the entire progression is not supported yet, so I did not change the chords.",
      });
    }

    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "clarify",
      confidence: 1,
      actions: [],
      clarificationQuestion:
        "Do you want to transpose the entire progression or a specific chord? Transposition is not supported yet, so I will not change anything until that is explicit.",
    });
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("interpret-style: GROQ_API_KEY is not configured.");
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "generate_new",
      confidence: 1,
      warning: "AI interpretation is not configured; using default style.",
    });
  }

  const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b";

  try {
    // Fail fast into the graceful fallback below rather than hanging. The SDK
    // defaults (maxRetries 2 + a long timeout) can turn one slow/rate-limited
    // call into 20s+ of backoff on the user's critical path.
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      timeout: 10_000,
      maxRetries: 1,
    });

    const userContent = JSON.stringify({
      message: prompt,
      hasExistingProgression,
      activeKey,
      currentProgression,
      pendingClarification,
    });

    const completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      max_completion_tokens: 500,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: GROQ_HARMONY_ROUTER_SCHEMA_NAME,
          strict: true,
          schema: GROQ_HARMONY_ROUTER_SCHEMA,
        },
      },
      messages: [
        { role: "system", content: ROUTER_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return json({
        ...DEFAULT_INTERPRETED_STYLE,
        intent: "generate_new",
        confidence: 1,
        warning: "AI interpretation was empty; using default style.",
      });
    }

    let parsed: GroqHarmonyRouterOutput;

    try {
      parsed = JSON.parse(content) as GroqHarmonyRouterOutput;
    } catch {
      return json({
        ...DEFAULT_INTERPRETED_STYLE,
        intent: "clarify",
        confidence: 0,
        actions: [],
        clarificationQuestion:
          "I could not read the harmony request clearly. Could you rephrase it?",
      });
    }

    const interpretation = sanitizeInterpretation(parsed);

    if (asksForExplicitDescendingBass(prompt)) {
      interpretation.descendingBassWeight = 1;
    }

    const confidence = clamp01(parsed.confidence, 0.5);

    const unsupportedActions = unsupportedActionTypes(parsed.actions);

    if (unsupportedActions.length > 0) {
      return json({
        ...interpretation,
        intent: "clarify",
        confidence,
        actions: [],
        clarificationQuestion: `I cannot apply unsupported action "${unsupportedActions[0]}" yet, so I did not change the chords.`,
      });
    }

    const sanitizedActions = sanitizeActions(parsed.actions);

    if (sanitizedActions.rejected) {
      return json({
        ...interpretation,
        intent: "clarify",
        confidence,
        actions: [],
        clarificationQuestion:
          "I could not safely apply every requested edit. Could you rephrase the complete request?",
      });
    }

    const actions = mergeExplicitCopyActions(
      mergeLiteralReplaceActions(
        sanitizedActions.actions,
        extractValidatedReplaceActions(prompt),
      ),
      extractExplicitCopyActions(prompt),
    );

    const modelIntent = asIntent(parsed.intent);
    const intent = isExistingStyleRevision(prompt, hasExistingProgression)
      ? "revise_existing"
      : modelIntent;
    if (!intent) {
      return json({
        ...interpretation,
        intent: "clarify",
        confidence,
        actions: [],
        clarificationQuestion:
          "Could you clarify whether you want a new progression, a revision, or an explanation?",
      });
    }

    const resolvedRevision =
      intent === "revise_existing"
        ? sanitizeRevision(parsed.revision, currentProgression.length)
        : undefined;

    if (intent === "revise_existing") {
      return json({
        ...interpretation,
        intent,
        confidence,
        revision: resolvedRevision,
        actions,
      });
    }

    if (intent === "clarify") {
      return json({
        ...interpretation,
        intent,
        confidence,
        actions: [],
        clarificationQuestion:
          asOptionalText(parsed.clarificationQuestion) ??
          "Could you clarify whether you want a new progression or a change to the current one?",
      });
    }

    if (intent === "answer_question") {
      return json({
        ...interpretation,
        intent,
        confidence,
        actions: [],
        assistantMessage:
          asOptionalText(parsed.assistantMessage, 500) ??
          "I could not determine an answer from the current progression.",
      });
    }

    return json({ ...interpretation, intent, confidence, actions });
  } catch (error) {
    // Log server-side only; never leak the key or a stack trace to the client.
    console.error(
      "interpret-style: Groq request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      intent: "generate_new",
      confidence: 1,
      warning: "AI interpretation was unavailable; using default style.",
    });
  }
}
