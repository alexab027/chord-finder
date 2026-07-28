import { describe, it, expect } from "vitest";
import { buildExplanationRequest } from "./explanationRequest";
import type {
  ChordCandidate,
  PlacedChord,
  ScoredChord,
} from "../../music/types";

// --- fixture helpers -------------------------------------------------------
// Only the fields the function actually reads matter; everything else is
// filled with valid-but-irrelevant values so TypeScript is satisfied.
function makeScored(
  symbol: string,
  romanNumeral: string,
  reasons: string[],
  score = 10,
): ScoredChord {
  const chord: ChordCandidate = {
    degree: 1,
    name: romanNumeral,
    romanNumeral,
    absoluteSymbol: symbol,
    rootName: "C",
    rootPc: 0,
    bassPc: 0,
    pcs: [0, 4, 7],
    noteNames: ["C", "E", "G"],
    pitches: ["c/4", "e/4", "g/4"],
    quality: "triad",
    keyFit: "diatonic",
  };
  return { chord, score, reasons };
}

// A voiced measure whose bass note (pitches[0]) is what we control.
function measureWithBass(bass: string): PlacedChord[] {
  return [
    { slot: 0, duration: "w", durationSlots: 8, pitches: [bass], symbol: "x" },
  ];
}

// --- tests -----------------------------------------------------------------
describe("buildExplanationRequest", () => {
  it("returns null when there are no chords", () => {
    expect(buildExplanationRequest([], [], "C major", "req", "sum")).toBeNull();
  });

  it("carries identity and score through to the payload", () => {
    const prog = [makeScored("C", "I", []), makeScored("G", "V", [], 8)];
    const voiced = [measureWithBass("c/4"), measureWithBass("g/3")];

    const req = buildExplanationRequest(prog, voiced, "C major", "warm", "s");

    expect(req).not.toBeNull();
    expect(req!.progression).toHaveLength(2);
    expect(req!.progression[0]).toMatchObject({
      measure: 1,
      symbol: "C",
      romanNumeral: "I",
      score: 10,
    });
  });

  it("drops a descending-bass reason when the bass does NOT descend", () => {
    // measure 2 bass (g/4) is HIGHER than measure 1 (c/4): no descent.
    const prog = [
      makeScored("C", "I", []),
      makeScored("G", "V", ["Chosen for its descending bass line"]),
    ];
    const voiced = [measureWithBass("c/4"), measureWithBass("g/4")];

    const req = buildExplanationRequest(prog, voiced, "C major", "r", "s");

    expect(req!.progression[1].reasons).not.toContain(
      "Chosen for its descending bass line",
    );
  });

  it("keeps the reason and adds concrete evidence when the bass descends", () => {
    // measure 2 bass (a/3) is LOWER than measure 1 (c/4): real descent.
    const prog = [
      makeScored("C", "I", []),
      makeScored("Am", "vi", ["Chosen for its descending bass line"]),
    ];
    const voiced = [measureWithBass("c/4"), measureWithBass("a/3")];

    const req = buildExplanationRequest(prog, voiced, "C major", "r", "s");
    const reasons = req!.progression[1].reasons;

    expect(reasons).toContain("Chosen for its descending bass line");
    expect(reasons.some((r) => /moves downward/i.test(r))).toBe(true);
  });
});
