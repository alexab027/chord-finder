import Groq from "groq-sdk";

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
- Use ONLY the supplied key, chord names, scores, style summary, and reasons.
- Do not change the progression, reorder it, or suggest different chords.
- Do not invent melody notes.
- Do not invent chord functions (e.g. "dominant", "subdominant") that are not in the supplied reasons.
- Do not invent voice-leading details.
- Do not claim a chord contains a particular melody note unless a supplied reason says so.
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

function json(body: ExplanationResponse | { error: string }, status = 200) {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let key = "";
  let styleRequest = "";
  let styleSummary = "";
  let progression: ProgressionItem[] = [];

  try {
    const body = (await request.json()) as Record<string, unknown>;
    key = asString(body.key, MAX_KEY_LENGTH);
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

  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

  // Only grounded facts produced by the engine are sent to Groq.
  const payload = { key, styleRequest, styleSummary, progression };

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
            asString(item.explanation, MAX_EXPLANATION_LENGTH)
          );
        }
      }
    }

    const response: ExplanationResponse = {
      overview: asString(parsed.overview, MAX_OVERVIEW_LENGTH),
      measures: progression.map((item) => ({
        measure: item.measure,
        chord: item.symbol,
        explanation: explanationByMeasure.get(item.measure) ?? "",
      })),
    };

    return json(response);
  } catch (error) {
    console.error(
      "explain-progression: Groq request failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return json({ error: "Explanation was unavailable." }, 502);
  }
}
