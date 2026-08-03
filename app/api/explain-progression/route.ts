import Groq from "groq-sdk";
import {
  checkGroqRateLimit,
  groqProviderRateLimitResponse,
  groqRateLimitResponse,
  isGroqProviderRateLimit,
} from "@/src/server/rateLimit";

const MAX_KEY_LENGTH = 40;
const MAX_STYLE_REQUEST_LENGTH = 500;
const MAX_STYLE_SUMMARY_LENGTH = 240;
const MAX_MEASURES = 8;
const MAX_SYMBOL_LENGTH = 40;
const MAX_REASONS = 6;
const MAX_REASON_LENGTH = 200;
const MAX_OVERVIEW_LENGTH = 600;
const MAX_EXPLANATION_LENGTH = 400;

type ProgressionItem = {
  measure: number;
  symbol: string;
  romanNumeral?: string;
  score?: number;
  reasons: string[];
};

type ExplanationResponse = {
  overview: string;
  measures: Array<{ measure: number; chord: string; explanation: string }>;
};

const SYSTEM_PROMPT = `You explain a chord progression that has already been chosen by a deterministic music engine. You are a writer, not an analyst.

Strict rules:
- Use ONLY the supplied activeKey, chord names, roman numerals, scores, style summary, and reasons.
- The supplied "activeKey" is the exact key context. Use exactly that key label. Never infer or mention a different parallel major/minor key.
- The supplied "progression" is the FINAL, actual result. Describe only those chords.
- "styleRequest" is what the user ASKED for and may describe edits or chords they wanted. It is NOT the result. Never state or imply that a requested change was made. Only mention a chord if it appears in the supplied "progression" for that measure. If the request asked for a chord that is not present in the final progression, do not describe it as if it exists.
- Do not change the progression, reorder it, or suggest different chords.
- Do not invent melody notes.
- Do not invent chord functions (e.g. "dominant", "subdominant") that are not in the supplied reasons.
- Do not invent voice-leading details.
- Do not claim a chord contains a particular melody note unless a supplied reason says so.
- Do not claim a chord "fits the key" unless a supplied reason explicitly says it fits the supplied activeKey.
- Do not claim the final result has descending bass motion unless a supplied reason explicitly gives final voiced bass MIDI evidence.
- If deterministic reasons are sparse or unavailable, use neutral wording like "The engine placed this chord here as part of the final progression."
- Keep suspension labels exactly aligned with the chord name: sus2 means sus2, sus4 means sus4, sus means sus. Do not swap them.
- If an action/replacement/copy reason is supplied, mention it as an edit reason rather than inventing theory.
- Explain in accessible, plain language for a curious beginner.
- Return ONLY a JSON object. No prose, no markdown.

Respond with exactly this shape:
{
  "overview": "Two or three concise sentences about the progression as a whole.",
  "measures": [
    { "measure": 1, "chord": "<echo the supplied chord name>", "explanation": "One or two concise sentences." }
  ]
}`;

function asString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeKeyLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeProgression(value: unknown): ProgressionItem[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_MEASURES).flatMap((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const measure = item.measure;
    const symbol = asString(item.symbol, MAX_SYMBOL_LENGTH);

    if (typeof measure !== "number" || !Number.isFinite(measure) || !symbol) {
      return [];
    }

    const reasons = Array.isArray(item.reasons)
      ? item.reasons
          .filter((reason): reason is string => typeof reason === "string")
          .map((reason) => reason.trim().slice(0, MAX_REASON_LENGTH))
          .filter((reason) => reason.length > 0)
          .slice(0, MAX_REASONS)
      : [];

    const romanNumeral = asString(item.romanNumeral, MAX_SYMBOL_LENGTH);
    const score =
      typeof item.score === "number" && Number.isFinite(item.score)
        ? item.score
        : undefined;

    return [
      {
        measure,
        symbol,
        ...(romanNumeral ? { romanNumeral } : {}),
        ...(score !== undefined ? { score } : {}),
        reasons,
      },
    ];
  });
}

function mentionsDifferentKey(text: string, activeKey: string) {
  const normalizedActiveKey = normalizeKeyLabel(activeKey).toLowerCase();
  const keyPattern = /\b[A-G](?:#|b)?\s+(?:major|minor)\b/g;
  return [...text.matchAll(keyPattern)].some(
    ([keyLabel]) =>
      normalizeKeyLabel(keyLabel).toLowerCase() !== normalizedActiveKey,
  );
}

function hasExplicitKeyFitReason(item: ProgressionItem, activeKey: string) {
  const fitReason =
    `fits the key of ${normalizeKeyLabel(activeKey)}`.toLowerCase();
  return item.reasons.some((reason) =>
    normalizeKeyLabel(reason).toLowerCase().includes(fitReason),
  );
}

function mentionsUnsupportedFitClaim(
  text: string,
  item: ProgressionItem,
  activeKey: string,
) {
  return (
    /\bfits?\s+(?:the\s+)?key\b/i.test(text) &&
    !hasExplicitKeyFitReason(item, activeKey)
  );
}

function hasFinalVoicedBassReason(item: ProgressionItem) {
  return item.reasons.some((reason) =>
    /\bfinal voiced bass moves downward\b/i.test(reason),
  );
}

function mentionsDescendingBassClaim(text: string) {
  return /\b(descending bass|bass line descends|bass descends|bass moves downward|downward bass motion)\b/i.test(
    text,
  );
}

function mentionsUnsupportedDescendingBassClaim(
  text: string,
  item: ProgressionItem,
) {
  return mentionsDescendingBassClaim(text) && !hasFinalVoicedBassReason(item);
}

function neutralMeasureExplanation(item: ProgressionItem, activeKey: string) {
  const actionReason = item.reasons.find((reason) =>
    /\b(copied|set to|by request|preserves|keeps)\b/i.test(reason),
  );
  if (actionReason) {
    return `${item.symbol} is the final chord for measure ${item.measure} in ${normalizeKeyLabel(activeKey)}. ${actionReason}.`;
  }

  const melodyReason = item.reasons.find((reason) =>
    /\bmelody note|melody notes\b/i.test(reason),
  );
  if (melodyReason) {
    return `${item.symbol} is the final chord for measure ${item.measure} in ${normalizeKeyLabel(activeKey)}. ${melodyReason}.`;
  }

  return `${item.symbol} is the final chord for measure ${item.measure} in ${normalizeKeyLabel(activeKey)}. The available deterministic data does not add more theory detail for this measure.`;
}

function neutralOverview(activeKey: string) {
  return `This is the final progression in ${normalizeKeyLabel(activeKey)}.`;
}

function expectedSuspension(symbol: string) {
  if (/\bsus2\b/i.test(symbol)) return "sus2";
  if (/\bsus4\b/i.test(symbol)) return "sus4";
  if (/\bsus\b/i.test(symbol)) return "sus";
  return null;
}

function mentionsWrongSuspension(text: string, symbol: string) {
  const suspension = expectedSuspension(symbol);
  if (!suspension) return false;

  return [...text.matchAll(/\bsus(?:2|4)?\b/gi)].some(
    ([label]) => label.toLowerCase() !== suspension,
  );
}

function sanitizeExplanationText(
  text: string,
  item: ProgressionItem,
  activeKey: string,
) {
  if (
    mentionsDifferentKey(text, activeKey) ||
    mentionsUnsupportedFitClaim(text, item, activeKey) ||
    mentionsUnsupportedDescendingBassClaim(text, item) ||
    mentionsWrongSuspension(text, item.symbol)
  ) {
    return neutralMeasureExplanation(item, activeKey);
  }

  return text;
}

function sanitizeOverviewText(
  text: string,
  activeKey: string,
  progression: ProgressionItem[],
) {
  const hasStrictDescendingBassEvidence =
    progression.length > 1 &&
    progression.slice(1).every((item) => hasFinalVoicedBassReason(item));

  return mentionsDifferentKey(text, activeKey) ||
    (mentionsDescendingBassClaim(text) && !hasStrictDescendingBassEvidence)
    ? neutralOverview(activeKey)
    : text;
}

function assertExplanationSanitizer() {
  const item: ProgressionItem = {
    measure: 1,
    symbol: "IVsus2",
    romanNumeral: "IVsus2",
    reasons: ["Uses a suspension for gentle tension."],
  };
  const sanitized = sanitizeExplanationText(
    "Measure 1 fits the key of A major and uses sus4 color.",
    item,
    "A minor",
  );

  if (
    sanitized !==
    "IVsus2 is the final chord for measure 1 in A minor. The available deterministic data does not add more theory detail for this measure."
  ) {
    throw new Error(
      "Explanation sanitizer failed to ground active key/suspension.",
    );
  }
}

if (process.env.NODE_ENV === "development") {
  assertExplanationSanitizer();
}

function json(body: ExplanationResponse | { error: string }, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let activeKey = "";
  let styleRequest = "";
  let styleSummary = "";
  let progression: ProgressionItem[] = [];

  try {
    const body = (await request.json()) as Record<string, unknown>;
    activeKey =
      asString(body.activeKey, MAX_KEY_LENGTH) ||
      asString(body.key, MAX_KEY_LENGTH);
    styleRequest = asString(body.styleRequest, MAX_STYLE_REQUEST_LENGTH);
    styleSummary = asString(body.styleSummary, MAX_STYLE_SUMMARY_LENGTH);
    progression = sanitizeProgression(body.progression);
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (progression.length === 0) {
    return json({ error: "No progression was supplied to explain." }, 400);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("explain-progression: GROQ_API_KEY is not configured.");
    return json({ error: "Explanation service is not configured." }, 503);
  }

  const model = process.env.GROQ_MODEL;

  if (!model) {
    console.error("GROQ_MODEL is not configured.");

    return Response.json(
      { error: "AI service is not configured." },
      { status: 503 },
    );
  }
  // Only grounded facts produced by the engine are sent to Groq.
  const payload = {
    activeKey: normalizeKeyLabel(activeKey),
    key: normalizeKeyLabel(activeKey),
    styleRequest,
    styleSummary,
    progression,
  };

  try {
    const rateLimit = await checkGroqRateLimit(request);
    if (!rateLimit.allowed) return groqRateLimitResponse(rateLimit);

    // Fail fast into the graceful fallback below rather than hanging. The SDK
    // Do not retry a paid request behind the per-IP quota: one admitted request
    // must produce at most one provider call.
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      timeout: 10_000,
      maxRetries: 0,
    });

    const completion = await groq.chat.completions.create({
      model,
      temperature: 0.25,
      max_completion_tokens: 450,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return json({ error: "Explanation was empty." }, 502);
    }

    const parsed = JSON.parse(content) as {
      overview?: unknown;
      measures?: unknown;
    };

    // Match the model's explanations back to the engine's chords by measure
    // number, so the returned progression can never be altered or reordered.
    const explanationByMeasure = new Map<number, string>();
    if (Array.isArray(parsed.measures)) {
      for (const raw of parsed.measures) {
        const item = (raw ?? {}) as Record<string, unknown>;
        if (typeof item.measure === "number") {
          explanationByMeasure.set(
            item.measure,
            asString(item.explanation, MAX_EXPLANATION_LENGTH),
          );
        }
      }
    }

    const response: ExplanationResponse = {
      overview: sanitizeOverviewText(
        asString(parsed.overview, MAX_OVERVIEW_LENGTH),
        activeKey,
        progression,
      ),
      measures: progression.map((item) => ({
        measure: item.measure,
        chord: item.symbol,
        explanation: sanitizeExplanationText(
          explanationByMeasure.get(item.measure) ?? "",
          item,
          activeKey,
        ),
      })),
    };

    return json(response);
  } catch (error) {
    if (isGroqProviderRateLimit(error)) {
      return groqProviderRateLimitResponse(error);
    }

    console.error("explain-progression: Groq request failed.");
    return json({ error: "Explanation was unavailable." }, 502);
  }
}
