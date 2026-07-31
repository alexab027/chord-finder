import { describe, expect, it } from "vitest";
import {
  asksForExplicitDescendingBass,
  getRelativeStyleChange,
} from "./requestLanguage";

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

describe("getRelativeStyleChange", () => {
  it("recognizes only comparative style movement", () => {
    expect(getRelativeStyleChange("make it simpler")).toBe("simpler");
    expect(getRelativeStyleChange("make this jazzier")).toBe("jazzier");
    expect(getRelativeStyleChange("make it simple")).toBeUndefined();
  });
});
