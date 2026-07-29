import { describe, expect, it } from "vitest";
import { DEFAULT_INTERPRETED_STYLE } from "../ai/types";
import { toGenerationPreferences } from "../ai/toGenerationPreferences";
import {
  applyHarmonyPreferencePatch,
  DEFAULT_HARMONY_PROFILE,
} from "./preferences";
import { resolveHarmonyPreferences } from "../harmony/preferences";

describe("default harmony profile", () => {
  it("blank interpretation defaults to the centralized high-consonance profile", () => {
    expect(toGenerationPreferences(DEFAULT_INTERPRETED_STYLE)).toEqual(
      DEFAULT_HARMONY_PROFILE,
    );
    expect(DEFAULT_HARMONY_PROFILE.melodyFitPriority).toBe(1);
    expect(DEFAULT_HARMONY_PROFILE.consonancePriority).toBe(0.9);
    expect(DEFAULT_HARMONY_PROFILE.dissonanceTolerance).toBe(0.1);
    expect(DEFAULT_HARMONY_PROFILE.playabilityRequired).toBe(true);
  });

  it("explicit style fields override blank defaults", () => {
    const explicit = toGenerationPreferences({
      ...DEFAULT_INTERPRETED_STYLE,
      primaryStyle: "jazzy",
      complexity: 0.8,
      dissonanceTolerance: 0.45,
      preferSevenths: true,
    });

    expect(explicit.style).toBe("jazzy");
    expect(explicit.complexity).toBe(0.8);
    expect(explicit.dissonanceTolerance).toBe(0.45);
    expect(explicit.preferSevenths).toBe(true);
    expect(explicit.melodyFitPriority).toBe(
      DEFAULT_HARMONY_PROFILE.melodyFitPriority,
    );
  });

  it("patching one field does not reset unrelated profile fields", () => {
    const patched = applyHarmonyPreferencePatch(DEFAULT_HARMONY_PROFILE, {
      complexityDelta: 0.2,
    });

    expect(patched.complexity).toBeCloseTo(0.45);
    expect(patched.dissonanceTolerance).toBe(
      DEFAULT_HARMONY_PROFILE.dissonanceTolerance,
    );
    expect(patched.preferSevenths).toBe(DEFAULT_HARMONY_PROFILE.preferSevenths);
    expect(patched.descendingBassWeight).toBe(
      DEFAULT_HARMONY_PROFILE.descendingBassWeight,
    );
  });

  // Mirrors the requestedActions branch of handleReviseExistingProgression:
  // a combined "replace chord 3 with Dm7 and make it jazzier" request applies
  // ONLY the returned preference patch to the current active preferences.
  it("combined chord-action + preference request applies only the returned patch", () => {
    const activePreferences = toGenerationPreferences({
      ...DEFAULT_INTERPRETED_STYLE,
      primaryStyle: "jazzy",
      complexity: 0.4,
      voiceLeadingPriority: 0.6,
      preferSevenths: true,
    });

    const patched = applyHarmonyPreferencePatch(activePreferences, {
      complexityDelta: 0.2,
    });

    expect(patched.complexity).toBeCloseTo(0.6);
    // Every unrelated preference is preserved.
    expect(patched.style).toBe("jazzy");
    expect(patched.voiceLeadingPriority).toBe(0.6);
    expect(patched.preferSevenths).toBe(true);
    expect(patched.dissonanceTolerance).toBe(
      activePreferences.dissonanceTolerance,
    );
  });
  it("applies an interpreted jazzy style to a creative revision", () => {
    const resolved = resolveHarmonyPreferences(DEFAULT_HARMONY_PROFILE, {
      style: "jazzy",
    });

    expect(resolved.style).toBe("jazzy");
  });

  it("switches a jazzy progression back to simple", () => {
    const resolved = resolveHarmonyPreferences(
      { ...DEFAULT_HARMONY_PROFILE, style: "jazzy" },
      { style: "simple" },
    );

    expect(resolved.style).toBe("simple");
  });

  it("preserves the active style when no style change is supplied", () => {
    const resolved = resolveHarmonyPreferences(
      { ...DEFAULT_HARMONY_PROFILE, style: "jazzy" },
      {
        patch: { complexityDelta: 0.2 },
      },
    );

    expect(resolved.style).toBe("jazzy");
  });
  // Mirrors the "replace chord 3 with Dm7 and use descending bass" case: the
  // style is handled separately, so the returned preference patch is empty and
  // must leave the active numeric preferences untouched.
  it("a style-only revision (empty patch) leaves active preferences untouched", () => {
    const activePreferences = toGenerationPreferences({
      ...DEFAULT_INTERPRETED_STYLE,
      complexity: 0.4,
      descendingBassWeight: 0.3,
    });

    expect(applyHarmonyPreferencePatch(activePreferences, {})).toEqual(
      activePreferences,
    );
  });
});
