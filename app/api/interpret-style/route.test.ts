import { describe, expect, it } from "vitest";
import { sanitizeCurrentProgression } from "./route";

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
