import type { ScoredChord } from "./types";

export type CurrentProgressionItem = {
  measure: number;
  absoluteSymbol: string;
  romanNumeral: string;
};

export function buildProgressionIdentityItems(
  progression: ScoredChord[],
): CurrentProgressionItem[] {
  return progression.map(({ chord }, index) => ({
    measure: index + 1,
    absoluteSymbol: chord.absoluteSymbol,
    romanNumeral: chord.romanNumeral,
  }));
}

export function buildExplanationIdentityItems(progression: ScoredChord[]) {
  return progression.map(({ chord }, index) => ({
    measure: index + 1,
    symbol: chord.absoluteSymbol,
    romanNumeral: chord.romanNumeral,
  }));
}

export function formatProgressionSummary(
  heading: string,
  progression: ScoredChord[],
) {
  return [
    heading,
    `Chords: ${progression.map(({ chord }) => chord.absoluteSymbol).join(" – ")}`,
    `Roman numerals: ${progression.map(({ chord }) => chord.romanNumeral).join(" – ")}`,
  ].join("\n");
}
