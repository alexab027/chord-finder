import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERPRETED_STYLE,
  type HarmonyRouterResponse,
} from "../ai/types";
import { normalizeHarmonyRequest } from "./request";

function response(
  patch: Partial<HarmonyRouterResponse>,
): HarmonyRouterResponse {
  return {
    ...DEFAULT_INTERPRETED_STYLE,
    intent: "revise_existing",
    confidence: 1,
    ...patch,
  };
}

describe("normalizeHarmonyRequest", () => {
  it("creates a first-class direct_edit for exact-only model output", () => {
    expect(
      normalizeHarmonyRequest({
        response: response({
          actions: [{ type: "replace_chord", measure: 2, chordName: "F" }],
        }),
        measureCount: 4,
      }),
    ).toMatchObject({ intent: "direct_edit" });
  });

  it("keeps creative plus exact edits in one revision transaction", () => {
    const normalized = normalizeHarmonyRequest({
      response: response({
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [],
          changeAmount: 0.3,
          requestedChanges: { complexityDelta: 0.5 },
        },
        actions: [{ type: "replace_chord", measure: 2, chordName: "C" }],
      }),
      measureCount: 4,
    });

    expect(normalized).toMatchObject({
      intent: "revise_existing",
      actions: [{ measure: 2 }],
    });
  });

  it("keeps a style-only creative clause combined with an exact edit", () => {
    const normalized = normalizeHarmonyRequest({
      response: response({
        actions: [{ type: "replace_chord", measure: 2, chordName: "C" }],
      }),
      measureCount: 4,
      prompt: "make it jazzier and change measure 2 to C",
    });

    expect(normalized.intent).toBe("revise_existing");
  });

  it("turns conflicting output into clarification with no executable actions", () => {
    const normalized = normalizeHarmonyRequest({
      response: response({
        actions: [
          { type: "replace_chord", measure: 2, chordName: "C" },
          { type: "replace_chord", measure: 2, chordName: "F" },
        ],
      }),
      measureCount: 4,
    });

    expect(normalized.intent).toBe("clarify");
    expect(normalized).not.toHaveProperty("actions");
  });
});
