import { describe, expect, it } from "vitest";
import { DEFAULT_INTERPRETED_STYLE } from "../ai/types";
import { buildRequestedChord } from "../music/chords";
import type { KeyContext, ScoredChord } from "../music/types";
import {
  buildHarmonyPersistenceSnapshot,
  EMPTY_HARMONY_HISTORY,
  recordHarmonyCommit,
} from "./history";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function progression(degrees: number[]): ScoredChord[] {
  return degrees.map((degree) => ({
    chord: buildRequestedChord(cMajor, degree, "major"),
    score: 0,
    reasons: [],
  }));
}

function commit(requestId: string, degrees = [1, 4, 5, 1]) {
  return {
    sessionId: "session-1",
    requestId,
    progression: progression(degrees),
    voicedProgression: [[], [], [], []],
    interpretation: DEFAULT_INTERPRETED_STYLE,
    source: "candidate_selection" as const,
  };
}

describe("recordHarmonyCommit", () => {
  it("adds exactly one serializable entry per commit identity", () => {
    const once = recordHarmonyCommit(EMPTY_HARMONY_HISTORY, commit("req-1"));
    const twice = recordHarmonyCommit(once, commit("req-1"));

    expect(twice).toBe(once);
    expect(twice.entries).toHaveLength(1);
    expect(twice.entries[0].schemaVersion).toBe(1);
    expect(() => JSON.stringify(twice)).not.toThrow();
  });

  it("tracks committed progression hashes as seen without duplicates", () => {
    const first = recordHarmonyCommit(
      EMPTY_HARMONY_HISTORY,
      commit("req-1"),
    );
    const sameMusic = recordHarmonyCommit(first, commit("req-2"));
    const different = recordHarmonyCommit(
      sameMusic,
      commit("req-3", [6, 4, 5, 1]),
    );

    expect(different.entries).toHaveLength(3);
    expect(different.seenHashes).toHaveLength(2);
  });

  it("builds a versioned JSON-safe snapshot with stable identity references", () => {
    const history = recordHarmonyCommit(
      EMPTY_HARMONY_HISTORY,
      commit("req-1"),
    );
    const snapshot = buildHarmonyPersistenceSnapshot(history);
    const roundTrip = JSON.parse(JSON.stringify(snapshot));

    expect(roundTrip.schemaVersion).toBe(1);
    expect(roundTrip.sessionIds).toEqual(["session-1"]);
    expect(roundTrip.commitIds).toEqual(["session-1:req-1"]);
    expect(roundTrip.progressionIds).toEqual(history.seenHashes);
  });
});
