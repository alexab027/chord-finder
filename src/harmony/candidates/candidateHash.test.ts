import { describe, expect, it } from "vitest";
import { buildKeyChords } from "../../music/chords";
import type { KeyContext, ScoredChord } from "../../music/types";
import {
  candidateHash,
  deduplicateCandidates,
} from "./candidateHash";

const cMajor: KeyContext = {
  signature: "C",
  label: "C major",
  tonicName: "c",
  tonicPc: 0,
  mode: "major",
};

function progression(): ScoredChord[] {
  const chords = buildKeyChords(cMajor);

  return [1, 5, 6, 4].map((degree) => ({
    chord: chords.find(
      (candidate) =>
        candidate.degree === degree &&
        candidate.quality === "triad" &&
        (candidate.inversion ?? 0) === 0,
    )!,
    score: degree,
    reasons: [`score-${degree}`],
  }));
}

describe("candidateHash", () => {
  it("is stable across score, reason, display, and voiced-octave changes", () => {
    const original = progression();
    const presentationChanged = original.map((scoredChord, index) => ({
      ...scoredChord,
      score: scoredChord.score + 100,
      reasons: ["different explanation"],
      bassMidi: 24 + index * 12,
      chord: {
        ...scoredChord.chord,
        absoluteSymbol: `display-${index}`,
        romanNumeral: `roman-${index}`,
        name: `name-${index}`,
      },
    }));

    expect(candidateHash(presentationChanged)).toBe(candidateHash(original));
  });

  it.each([
    ["degree", { degree: 2 }],
    ["root", { rootPc: 1 }],
    ["quality", { quality: "sus4" as const }],
    ["bass", { bassPc: 4 }],
    ["inversion", { inversion: 1 }],
  ])("changes when the %s identity changes", (_label, identityChange) => {
    const original = progression();
    const changed = original.map((scoredChord, index) =>
      index === 0
        ? {
            ...scoredChord,
            chord: { ...scoredChord.chord, ...identityChange },
          }
        : scoredChord,
    );

    expect(candidateHash(changed)).not.toBe(candidateHash(original));
  });

  it("includes measure order", () => {
    const original = progression();

    expect(candidateHash([...original].reverse())).not.toBe(
      candidateHash(original),
    );
  });
});

describe("deduplicateCandidates", () => {
  it("keeps the first candidate for each hash without padding the result", () => {
    const original = { id: "first", progression: progression() };
    const duplicate = {
      id: "duplicate",
      progression: progression().map((scoredChord) => ({
        ...scoredChord,
        score: scoredChord.score + 10,
      })),
    };
    const distinct = {
      id: "distinct",
      progression: [...progression()].reverse(),
    };

    expect(deduplicateCandidates([original, duplicate, distinct])).toEqual([
      original,
      distinct,
    ]);
  });
});
