import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroqHarmonyRouterOutput } from "@/src/ai/harmonyRouterSchema";

const { checkGroqRateLimitMock, createCompletionMock } = vi.hoisted(() => ({
  checkGroqRateLimitMock: vi.fn(),
  createCompletionMock: vi.fn(),
}));

vi.mock("@/src/server/rateLimit", () => ({
  checkGroqRateLimit: checkGroqRateLimitMock,
  groqRateLimitResponse: (decision: {
    status: number;
    code: string;
    retryAfterSeconds?: number;
  }) =>
    Response.json(
      {
        error: "Too many AI requests.",
        code: decision.code,
        ...(decision.retryAfterSeconds
          ? { retryAfterSeconds: decision.retryAfterSeconds }
          : {}),
      },
      {
        status: decision.status,
        ...(decision.retryAfterSeconds
          ? { headers: { "Retry-After": String(decision.retryAfterSeconds) } }
          : {}),
      },
    ),
  isGroqProviderRateLimit: (error: unknown) =>
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 429,
  groqProviderRateLimitResponse: () =>
    Response.json(
      {
        error: "The AI provider is temporarily rate limited.",
        code: "provider_rate_limited",
        retryAfterSeconds: 17,
      },
      { status: 429, headers: { "Retry-After": "17" } },
    ),
}));

vi.mock("groq-sdk", () => ({
  default: class MockGroq {
    chat = {
      completions: {
        create: createCompletionMock,
      },
    };
  },
}));

import { POST, sanitizeCurrentProgression } from "./route";

const originalGroqApiKey = process.env.GROQ_API_KEY;
const originalGroqModel = process.env.GROQ_MODEL;

const currentProgression = [
  { measure: 1, absoluteSymbol: "C", romanNumeral: "I" },
  { measure: 2, absoluteSymbol: "Am", romanNumeral: "vi" },
  { measure: 3, absoluteSymbol: "F", romanNumeral: "IV" },
  { measure: 4, absoluteSymbol: "G", romanNumeral: "V" },
];

const baseGroqOutput: GroqHarmonyRouterOutput = {
  intent: "generate_new",
  confidence: 0.95,
  primaryStyle: "simple",
  melodyFitPriority: 1,
  consonancePriority: 0.9,
  descendingBassWeight: 0,
  complexity: 0,
  dissonanceTolerance: 0,
  cadenceStrength: 0,
  preferSevenths: false,
  preferSuspensions: false,
  voiceLeadingPriority: 0.75,
  playabilityRequired: true,
  mood: [],
  summary: "Use a clear progression.",
  revision: null,
  actions: [],
  clarificationQuestion: null,
  assistantMessage: null,
};

afterEach(() => {
  checkGroqRateLimitMock.mockReset();
  checkGroqRateLimitMock.mockResolvedValue({ allowed: true, enforced: true });
  createCompletionMock.mockReset();
  if (originalGroqApiKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqApiKey;
  if (originalGroqModel === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = originalGroqModel;
  vi.restoreAllMocks();
});

checkGroqRateLimitMock.mockResolvedValue({ allowed: true, enforced: true });

async function postInterpretation(body: Record<string, unknown>) {
  const response = await postInterpretationResponse(body);
  return response.json();
}

async function postInterpretationResponse(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/interpret-style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function interpret(message: string) {
  delete process.env.GROQ_API_KEY;
  return postInterpretation({ message });
}

async function interpretWithGroq(
  message: string,
  output: GroqHarmonyRouterOutput | Record<string, unknown>,
  body: Record<string, unknown> = {},
) {
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.GROQ_MODEL;
  createCompletionMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(output) } }],
  });

  return postInterpretation({ message, ...body });
}

describe("current progression sanitization", () => {
  it("preserves absolute and Roman chord identities", () => {
    expect(
      sanitizeCurrentProgression([
        {
          measure: 1,
          absoluteSymbol: "Cmaj7",
          romanNumeral: "Imaj7",
        },
      ]),
    ).toEqual([
      {
        measure: 1,
        absoluteSymbol: "Cmaj7",
        romanNumeral: "Imaj7",
      },
    ]);
  });

  it("keeps Roman-only payloads compatible", () => {
    expect(
      sanitizeCurrentProgression([{ measure: 1, romanNumeral: "Imaj7" }]),
    ).toEqual([
      {
        measure: 1,
        absoluteSymbol: "Imaj7",
        romanNumeral: "Imaj7",
      },
    ]);
  });

  it("keeps only unique integer measure identities in sorted staff order", () => {
    expect(
      sanitizeCurrentProgression([
        { measure: 3, absoluteSymbol: "G", romanNumeral: "V" },
        { measure: 1.5, absoluteSymbol: "C", romanNumeral: "I" },
        { measure: 1, absoluteSymbol: "C", romanNumeral: "I" },
        { measure: 3, absoluteSymbol: "G7", romanNumeral: "V7" },
        { measure: 9, absoluteSymbol: "F", romanNumeral: "IV" },
      ]),
    ).toEqual([
      { measure: 1, absoluteSymbol: "C", romanNumeral: "I" },
      { measure: 3, absoluteSymbol: "G7", romanNumeral: "V7" },
    ]);
  });
});

describe("strict Groq router contract", () => {
  it("sends the strict schema and GPT-OSS compatibility settings", async () => {
    await interpretWithGroq("generate a progression", baseGroqOutput);

    expect(createCompletionMock).toHaveBeenCalledOnce();
    const request = createCompletionMock.mock.calls[0][0];
    expect(request).toMatchObject({
      model: "openai/gpt-oss-20b",
      temperature: 0,
      max_completion_tokens: 500,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "harmony_router_response_v1",
          strict: true,
        },
      },
    });
    expect(request).not.toHaveProperty("reasoning_format");
    expect(request.response_format.json_schema.schema).toBeDefined();
  });

  it.each(["simple", "jazzy"] as const)(
    "returns a %s model interpretation",
    async (primaryStyle) => {
      const result = await interpretWithGroq(`generate ${primaryStyle}`, {
        ...baseGroqOutput,
        primaryStyle,
      });

      expect(result.primaryStyle).toBe(primaryStyle);
      expect(result.intent).toBe("generate_new");
      expect(result.actions).toEqual([]);
      expect(result.revision).toBeUndefined();
      expect(result.clarificationQuestion).toBeUndefined();
      expect(result.assistantMessage).toBeUndefined();
    },
  );

  it("keeps descending bass as a preference weight", async () => {
    const result = await interpretWithGroq("use a falling bass line", {
      ...baseGroqOutput,
      descendingBassWeight: 0.8,
    });

    expect(result.primaryStyle).toBe("simple");
    expect(result.descendingBassWeight).toBe(0.8);
  });

  it("normalizes nullable revision deltas into optional domain deltas", async () => {
    const result = await interpretWithGroq(
      "change the current progression",
      {
        ...baseGroqOutput,
        intent: "revise_existing",
        primaryStyle: "jazzy",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [1, 4],
          changeAmount: 0.5,
          requestedChanges: {
            complexityDelta: 0.5,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: -0.25,
          },
        },
      },
      {
        hasProgression: true,
        currentProgression,
      },
    );

    expect(result.intent).toBe("revise_existing");
    expect(result.revision).toEqual({
      preserveOverallProgression: true,
      preserveChordPositions: [1, 4],
      changeAmount: 0.5,
      requestedChanges: {
        complexityDelta: 0.5,
        cadenceDelta: -0.25,
      },
    });
    expect(result.clarificationQuestion).toBeUndefined();
    expect(result.assistantMessage).toBeUndefined();
  });

  it("validates preserved positions against accepted measure identities", async () => {
    const result = await interpretWithGroq(
      "keep the available measures",
      {
        ...baseGroqOutput,
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [1, 2, 3],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: null,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
      },
      {
        hasProgression: true,
        currentProgression: [currentProgression[0], currentProgression[2]],
      },
    );

    expect(result.revision.preserveChordPositions).toEqual([1, 3]);
  });

  it("returns clarification text and omits unrelated strict fields", async () => {
    const result = await interpretWithGroq("change something", {
      ...baseGroqOutput,
      intent: "clarify",
      clarificationQuestion: "Which measure should change?",
    });

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toBe("Which measure should change?");
    expect(result.revision).toBeUndefined();
    expect(result.assistantMessage).toBeUndefined();
  });

  it("returns an answer and omits unrelated strict fields", async () => {
    const result = await interpretWithGroq("why does this resolve?", {
      ...baseGroqOutput,
      intent: "answer_question",
      assistantMessage: "The dominant resolves to the tonic.",
    });

    expect(result.intent).toBe("answer_question");
    expect(result.actions).toEqual([]);
    expect(result.assistantMessage).toBe("The dominant resolves to the tonic.");
    expect(result.revision).toBeUndefined();
    expect(result.clarificationQuestion).toBeUndefined();
  });

  it("normalizes all supported action variants", async () => {
    const result = await interpretWithGroq(
      "change the current harmony",
      {
        ...baseGroqOutput,
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: null,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
        actions: [
          { type: "copy_chord", fromMeasure: 1, toMeasure: 4 },
          {
            type: "set_chord",
            measure: 2,
            degree: 5,
            quality: "dominant",
            extension: null,
          },
          {
            type: "set_chord",
            measure: 3,
            degree: 2,
            quality: "minor",
            extension: 7,
          },
          { type: "replace_chord", measure: 1, chordName: "Cmaj7" },
        ],
      },
      {
        hasProgression: true,
        currentProgression,
      },
    );

    expect(result.actions).toEqual([
      { type: "copy_chord", fromMeasure: 1, toMeasure: 4 },
      {
        type: "set_chord",
        measure: 2,
        degree: 5,
        quality: "dominant",
      },
      {
        type: "set_chord",
        measure: 3,
        degree: 2,
        quality: "minor",
        extension: 7,
      },
      { type: "replace_chord", measure: 1, chordName: "Cmaj7" },
    ]);
  });

  it.each([
    {
      label: "an invalid chord name",
      action: {
        type: "replace_chord",
        measure: 2,
        chordName: "not-a-chord",
      },
    },
    {
      label: "a copy with the same source and target",
      action: {
        type: "copy_chord",
        fromMeasure: 2,
        toMeasure: 2,
      },
    },
  ])("still rejects $label after schema parsing", async ({ action }) => {
    const result = await interpretWithGroq(
      "change the current harmony",
      {
        ...baseGroqOutput,
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: null,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
        actions: [action],
      },
      {
        hasProgression: true,
        currentProgression,
      },
    );

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toMatch(
      /safely apply every requested/i,
    );
  });

  it("retains the unsupported-action clarification defense", async () => {
    const result = await interpretWithGroq("change the current harmony", {
      ...baseGroqOutput,
      intent: "revise_existing",
      revision: {
        preserveOverallProgression: true,
        preserveChordPositions: [],
        changeAmount: 0.3,
        requestedChanges: {
          complexityDelta: null,
          dissonanceDelta: null,
          descendingBassDelta: null,
          cadenceDelta: null,
        },
      },
      actions: [{ type: "transpose_progression", amount: 2 }],
    });

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toMatch(/unsupported action/i);
  });

  it("rejects conflicting model actions as one transaction", async () => {
    const result = await interpretWithGroq(
      "change chord 2 twice",
      {
        ...baseGroqOutput,
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: null,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
        actions: [
          { type: "replace_chord", measure: 2, chordName: "F" },
          { type: "replace_chord", measure: 2, chordName: "Am" },
        ],
      },
      { hasProgression: true, currentProgression },
    );

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toMatch(/conflicting/i);
  });
});

describe("explicit named-chord edits", () => {
  it.each(["add a Dm7 somewhere", "add a Dm7"])(
    "clarifies a missing target for %s",
    async (message) => {
      const result = await interpret(message);

      expect(result.intent).toBe("clarify");
      expect(result.actions).toEqual([]);
      expect(result.clarificationQuestion).toMatch(/which measure/i);
      expect(result.warning).toBeUndefined();
    },
  );

  it.each([
    ["add a Dm7 in measure 2", 2],
    ["replace the second chord with Dm7", 2],
  ])("creates a deterministic replacement for %s", async (message, measure) => {
    const result = await interpret(message);

    expect(result.intent).toBe("revise_existing");
    expect(result.actions).toEqual([
      { type: "replace_chord", measure, chordName: "Dm7" },
    ]);
    expect(result.warning).toBeUndefined();
  });

  it("does not treat add color as a named-chord edit", async () => {
    const result = await interpret("add color");

    expect(result.actions).toEqual([]);
    expect(result.intent).toBe("clarify");
    expect(result.warning).toMatch(/not configured/i);
  });

  it("clarifies an out-of-range named-chord target", async () => {
    const result = await interpret("add a Dm7 in measure 9");

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toMatch(/out of range/i);
    expect(result.warning).toBeUndefined();
  });

  it("bypasses Groq for a deterministic exact edit", async () => {
    process.env.GROQ_API_KEY = "test-key";

    const result = await postInterpretation({
      message: "add a Dm7 in measure 2",
      hasProgression: true,
      currentProgression,
    });

    expect(result.intent).toBe("revise_existing");
    expect(result.actions).toEqual([
      { type: "replace_chord", measure: 2, chordName: "Dm7" },
    ]);
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("bypasses Groq for a deterministically unsupported operation", async () => {
    process.env.GROQ_API_KEY = "test-key";

    const result = await postInterpretation({
      message: "transpose the whole progression up two semitones",
      hasProgression: true,
      currentProgression,
    });

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toMatch(/not supported/i);
    expect(createCompletionMock).not.toHaveBeenCalled();
  });
});

describe("Groq rate-limit boundary", () => {
  it("checks quota only when the route is about to call Groq", async () => {
    process.env.GROQ_API_KEY = "test-key";

    await postInterpretation({ message: "" });
    await postInterpretation({ message: "x".repeat(501) });
    await postInterpretation({
      message: "add a Dm7 in measure 2",
      hasProgression: true,
      currentProgression,
    });

    expect(checkGroqRateLimitMock).not.toHaveBeenCalled();
    expect(createCompletionMock).not.toHaveBeenCalled();

    createCompletionMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify(baseGroqOutput) } }],
    });
    await postInterpretation({ message: "make it warm" });

    expect(checkGroqRateLimitMock).toHaveBeenCalledTimes(1);
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 429 with retry metadata without contacting Groq", async () => {
    process.env.GROQ_API_KEY = "test-key";
    checkGroqRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      code: "rate_limit_exceeded",
      status: 429,
      retryAfterSeconds: 23,
    });

    const response = await postInterpretationResponse({
      message: "make it warm",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("23");
    await expect(response.json()).resolves.toMatchObject({
      code: "rate_limit_exceeded",
      retryAfterSeconds: 23,
    });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("keeps deterministic edits available when AI quota is exhausted", async () => {
    process.env.GROQ_API_KEY = "test-key";
    checkGroqRateLimitMock.mockResolvedValue({
      allowed: false,
      code: "rate_limit_exceeded",
      status: 429,
      retryAfterSeconds: 23,
    });

    const result = await postInterpretation({
      message: "add a Dm7 in measure 2",
      hasProgression: true,
      currentProgression,
    });

    expect(result).toMatchObject({
      intent: "revise_existing",
      actions: [{ type: "replace_chord", measure: 2, chordName: "Dm7" }],
    });
    expect(checkGroqRateLimitMock).not.toHaveBeenCalled();
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("returns 503 without contacting Groq when limiting is unavailable", async () => {
    process.env.GROQ_API_KEY = "test-key";
    checkGroqRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      code: "rate_limit_unavailable",
      status: 503,
    });

    const response = await postInterpretationResponse({
      message: "make it warm",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "rate_limit_unavailable",
    });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("preserves a Groq provider 429", async () => {
    process.env.GROQ_API_KEY = "test-key";
    createCompletionMock.mockRejectedValueOnce({ status: 429 });

    const response = await postInterpretationResponse({
      message: "make it warm",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    await expect(response.json()).resolves.toMatchObject({
      code: "provider_rate_limited",
      retryAfterSeconds: 17,
    });
  });

  it("does not log raw prompts when a provider request fails", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const rawPrompt = "private harmony prompt";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    createCompletionMock.mockRejectedValueOnce(
      new Error(`provider rejected ${rawPrompt}`),
    );

    await postInterpretation({ message: rawPrompt });

    expect(errorSpy).toHaveBeenCalledWith(
      "interpret-style: Groq request failed.",
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(rawPrompt);
  });
});
