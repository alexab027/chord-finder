import { describe, expect, it } from "vitest";
import { asksForExplicitDescendingBass } from "./requestLanguage";

describe("asksForExplicitDescendingBass", () => {
  it("recognizes a positive request", () => {
    expect(asksForExplicitDescendingBass("use a descending bass line")).toBe(
      true,
    );
  });

  it.each([
    "do not use a descending bass line",
    "avoid descending bass",
    "I want less descending bass",
    "make it jazzy without a descending bass",
  ])("does not turn a negated request into a positive preference: %s", (text) => {
    expect(asksForExplicitDescendingBass(text)).toBe(false);
  });
});
