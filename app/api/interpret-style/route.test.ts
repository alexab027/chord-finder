import { afterEach, describe, expect, it } from "vitest";
import { POST, sanitizeCurrentProgression } from "./route";

const originalGroqApiKey = process.env.GROQ_API_KEY;

afterEach(() => {
  if (originalGroqApiKey === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = originalGroqApiKey;
});

async function interpret(message: string) {
  delete process.env.GROQ_API_KEY;
  const response = await POST(
    new Request("http://localhost/api/interpret-style", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    }),
  );
  return response.json();
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

    expect(result.actions).toBeUndefined();
    expect(result.warning).toMatch(/not configured/i);
  });

  it("clarifies an out-of-range named-chord target", async () => {
    const result = await interpret("add a Dm7 in measure 9");

    expect(result.intent).toBe("clarify");
    expect(result.actions).toEqual([]);
    expect(result.clarificationQuestion).toMatch(/out of range/i);
    expect(result.warning).toBeUndefined();
  });
});
