import type { GenerationMode, KeyContext, PlacedNote } from "./types";
import {
  mod12,
  NOTE_LABELS,
  NOTE_TO_PC,
  pitchToPc,
  SCALE_OFFSETS,
} from "./noteUtils";

const KEY_SIGNATURE_CONTEXTS: Record<
  string,
  { major: string; minor: string }
> = {
  C: { major: "c", minor: "a" },
  G: { major: "g", minor: "e" },
  D: { major: "d", minor: "b" },
  A: { major: "a", minor: "f#" },
  E: { major: "e", minor: "c#" },
  B: { major: "b", minor: "g#" },
  F: { major: "f", minor: "d" },
  Bb: { major: "bb", minor: "g" },
  Eb: { major: "eb", minor: "c" },
  Ab: { major: "ab", minor: "f" },
};

export function getKeyContexts(keySignature: string): KeyContext[] {
  const signatureKeys = KEY_SIGNATURE_CONTEXTS[keySignature] ?? {
    major: "c",
    minor: "a",
  };

  return [
    {
      signature: keySignature,
      label: `${NOTE_LABELS[signatureKeys.major]} major`,
      tonicName: signatureKeys.major,
      tonicPc: NOTE_TO_PC[signatureKeys.major],
      mode: "major",
    },
    {
      signature: keySignature,
      label: `${NOTE_LABELS[signatureKeys.minor]} minor`,
      tonicName: signatureKeys.minor,
      tonicPc: NOTE_TO_PC[signatureKeys.minor],
      mode: "minor",
    },
  ];
}

function getMelodyPcs(
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  return measures.flatMap((measureNotes) =>
    measureNotes.flatMap((note) => {
      if (note.kind === "rest") return [];

      const pc = pitchToPc(getRenderedPitchFn(note));
      return pc === undefined ? [] : [{ pc, durationSlots: note.durationSlots }];
    })
  );
}

function inferKeyFromMelody(
  keySignature: string,
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  const melodyPcs = getMelodyPcs(measures, getRenderedPitchFn);
  const candidateKeys = getKeyContexts(keySignature);

  if (melodyPcs.length === 0) {
    return candidateKeys[0];
  }

  let bestKey = candidateKeys[0];
  let bestScore = -Infinity;

  for (const key of candidateKeys) {
    const scalePcs = SCALE_OFFSETS[key.mode].map((offset) =>
      mod12(key.tonicPc + offset)
    );
    const dominantPc = mod12(key.tonicPc + 7);
    let score = 0;

    melodyPcs.forEach(({ pc, durationSlots }, index) => {
      if (scalePcs.includes(pc)) score += durationSlots;
      else score -= durationSlots * 2;

      if (pc === key.tonicPc) score += durationSlots * 0.8;
      if (pc === dominantPc) score += durationSlots * 0.35;
      if (index === melodyPcs.length - 1 && pc === key.tonicPc) score += 3;
    });

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestKey;
}

export function getGenerationKey(
  keySignature: string,
  generationMode: GenerationMode,
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string
) {
  if (generationMode === "automatic") {
    return inferKeyFromMelody(keySignature, measures, getRenderedPitchFn);
  }

  const keyContexts = getKeyContexts(keySignature);
  return (
    keyContexts.find((keyContext) => keyContext.mode === generationMode) ??
    keyContexts[0]
  );
}
