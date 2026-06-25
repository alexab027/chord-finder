import Groq from "groq-sdk";
import {
  ALLOWED_STYLES,
  DEFAULT_INTERPRETED_STYLE,
  type InterpretedStyle,
} from "@/src/ai/types";
import type { StyleOption } from "@/src/music/types";

const MAX_PROMPT_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 240;
const MAX_MOOD_ITEMS = 5;
const MAX_MOOD_LENGTH = 40;

type InterpretResponse = InterpretedStyle & { warning?: string };

const SYSTEM_PROMPT = `You translate a musician's plain-English description of the harmony they want into a small JSON settings object. You do NOT compose music.

Rules:
- Return ONLY a JSON object. No prose, no markdown.
- "primaryStyle" must be exactly one of: "simple", "jazzy", "bluesy", "descendingBass". Use no other value.
- Do not return chord names. Do not generate a progression.
- Map simple / pop / clean / basic language toward "simple".
- Map jazz / lush / sophisticated / colorful language toward "jazzy".
- Map blues / gritty / dominant-seventh language toward "bluesy".
- Increase "descendingBassWeight" for falling, walking-down, or descending bass requests.
- Lower "dissonanceTolerance" for safe, smooth, or consonant requests.
- Raise "dissonanceTolerance" for tense, surprising, or experimental requests.
- Raise "cadenceStrength" for resolved, satisfying, or strong-ending requests.

All numeric fields are between 0 and 1. Respond with exactly this shape:
{
  "primaryStyle": "simple",
  "descendingBassWeight": 0.0,
  "complexity": 0.0,
  "dissonanceTolerance": 0.0,
  "cadenceStrength": 0.0,
  "preferSevenths": false,
  "preferSuspensions": false,
  "mood": [],
  "summary": ""
}`;

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
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

// Coerce an arbitrary parsed object into a safe InterpretedStyle, substituting
// defaults for anything missing or out of range.
function sanitizeInterpretation(raw: unknown): InterpretedStyle {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    primaryStyle: asStyle(data.primaryStyle),
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
    mood: asMood(data.mood),
    summary: asSummary(data.summary),
  };
}

function json(body: InterpretResponse, status = 200): Response {
  return Response.json(body, { status });
}

export async function POST(request: Request): Promise<Response> {
  let prompt = "";

  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    // Malformed JSON body: fall back to safe defaults rather than throwing.
    return json({ ...DEFAULT_INTERPRETED_STYLE });
  }

  // Empty prompt: deterministic defaults, no Groq call.
  if (prompt.length === 0) {
    return json({ ...DEFAULT_INTERPRETED_STYLE });
  }

  // Reject overly long prompts, but keep a usable response shape.
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return json(
      {
        ...DEFAULT_INTERPRETED_STYLE,
        warning: `Prompt exceeds ${MAX_PROMPT_LENGTH} characters; using default style.`,
      },
      400,
    );
  }

  if (!process.env.GROQ_API_KEY) {
    console.error("interpret-style: GROQ_API_KEY is not configured.");
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      warning: "AI interpretation is not configured; using default style.",
    });
  }

  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      max_completion_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return json({
        ...DEFAULT_INTERPRETED_STYLE,
        warning: "AI interpretation was empty; using default style.",
      });
    }

    const parsed = JSON.parse(content) as unknown;
    return json(sanitizeInterpretation(parsed));
  } catch (error) {
    // Log server-side only; never leak the key or a stack trace to the client.
    console.error(
      "interpret-style: Groq request failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return json({
      ...DEFAULT_INTERPRETED_STYLE,
      warning: "AI interpretation was unavailable; using default style.",
    });
  }
}
