import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        error: "AI request unavailable.",
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
        retryAfterSeconds: 11,
      },
      { status: 429, headers: { "Retry-After": "11" } },
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

import { POST } from "./route";

const originalGroqApiKey = process.env.GROQ_API_KEY;
const originalGroqModel = process.env.GROQ_MODEL;

const validBody = {
  activeKey: "C major",
  styleRequest: "warm and simple",
  styleSummary: "A warm progression.",
  progression: [
    {
      measure: 1,
      symbol: "C",
      romanNumeral: "I",
      reasons: ["Supports the melody notes."],
    },
  ],
};

function postExplanation(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/explain-progression", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "test-model";
  checkGroqRateLimitMock.mockResolvedValue({ allowed: true, enforced: true });
});

afterEach(() => {
  checkGroqRateLimitMock.mockReset();
  createCompletionMock.mockReset();
  if (originalGroqApiKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqApiKey;
  if (originalGroqModel === undefined) delete process.env.GROQ_MODEL;
  else process.env.GROQ_MODEL = originalGroqModel;
  vi.restoreAllMocks();
});

describe("explanation Groq rate-limit boundary", () => {
  it("does not consume quota for validation failures", async () => {
    const response = await postExplanation({ progression: [] });

    expect(response.status).toBe(400);
    expect(checkGroqRateLimitMock).not.toHaveBeenCalled();
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("checks quota immediately before a Groq request", async () => {
    createCompletionMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              overview: "A grounded overview.",
              measures: [{ measure: 1, explanation: "A grounded reason." }],
            }),
          },
        },
      ],
    });

    const response = await postExplanation(validBody);

    expect(response.status).toBe(200);
    expect(checkGroqRateLimitMock).toHaveBeenCalledTimes(1);
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    expect(
      checkGroqRateLimitMock.mock.invocationCallOrder[0],
    ).toBeLessThan(createCompletionMock.mock.invocationCallOrder[0]);
  });

  it("returns a local 429 without contacting Groq", async () => {
    checkGroqRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      code: "rate_limit_exceeded",
      status: 429,
      retryAfterSeconds: 31,
    });

    const response = await postExplanation(validBody);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("31");
    await expect(response.json()).resolves.toMatchObject({
      code: "rate_limit_exceeded",
      retryAfterSeconds: 31,
    });
    expect(createCompletionMock).not.toHaveBeenCalled();
  });

  it("preserves a Groq provider 429", async () => {
    createCompletionMock.mockRejectedValueOnce({ status: 429 });

    const response = await postExplanation(validBody);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("11");
    await expect(response.json()).resolves.toMatchObject({
      code: "provider_rate_limited",
      retryAfterSeconds: 11,
    });
  });
});
