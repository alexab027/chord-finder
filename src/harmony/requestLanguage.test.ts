import { describe, expect, it } from "vitest";
import {
  asksForExplicitDescendingBass,
  getRelativeStyleChange,
  getStyleAlternativeReply,
  isSupportedFocusedHarmonyQuestion,
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
  it.each([
    "jazzier",
    "more jazzy",
    "much more jazzy",
    "even more jazzy",
    "a little more jazzy",
    "slightly more jazzy",
  ])("normalizes jazz movement: %s", (phrase) => {
    expect(getRelativeStyleChange(`make it ${phrase}`)).toBe("jazzier");
  });

  it.each([
    "simpler",
    "more simple",
    "much more simple",
    "even more simple",
    "a little more simple",
    "slightly more simple",
  ])("normalizes simple movement: %s", (phrase) => {
    expect(getRelativeStyleChange(`make it ${phrase}`)).toBe("simpler");
  });

  it.each([
    "make it simple",
    "make it jazzy",
    "not jazzier",
    "less jazzy",
    "don't make it more jazzy",
    "do not make this simpler",
  ])("does not invent positive relative movement: %s", (prompt) => {
    expect(getRelativeStyleChange(prompt)).toBeUndefined();
  });
});

describe("getStyleAlternativeReply", () => {
  it.each(["yes", "sure", "show different", "show me alternatives", "different options"])(
    "accepts a deterministic alternative reply: %s",
    (prompt) => {
      expect(getStyleAlternativeReply(prompt)).toBe("accept");
    },
  );

  it.each(["no", "never mind", "cancel"])(
    "recognizes a declined alternative reply: %s",
    (prompt) => {
      expect(getStyleAlternativeReply(prompt)).toBe("decline");
    },
  );

  it("leaves unrelated requests alone", () => {
    expect(getStyleAlternativeReply("make measure 2 Dm")).toBeUndefined();
  });
});

describe("isSupportedFocusedHarmonyQuestion", () => {
  it.each([
    "why is measure three a C chord",
    "explain measures 2 to 3",
    "what makes this candidate different?",
  ])("recognizes a narrow grounded question: %s", (prompt) => {
    expect(isSupportedFocusedHarmonyQuestion(prompt)).toBe(true);
  });

  it.each([
    "make measure three a C chord",
    "make chords 2 and 3 jazzier",
    "give me a different option",
  ])("does not reroute a creative request: %s", (prompt) => {
    expect(isSupportedFocusedHarmonyQuestion(prompt)).toBe(false);
  });
});
