import {
  KEY_SIGNATURE_ACCIDENTALS,
  PITCHES_TOP_TO_BOTTOM,
} from "../../music/noteUtils";
import type { PlacedNote } from "../../music/types";

export function renderPitch(note: PlacedNote, keySignature: string): string {
  if (note.kind === "rest") {
    return note.pitch;
  }

  const [letter, octave] = note.pitch.split("/");
  const lowerLetter = letter.toLowerCase();

  // Explicit accidental wins.
  if (note.accidental === "#") {
    return `${lowerLetter}#/${octave}`;
  }

  if (note.accidental === "b") {
    return `${lowerLetter}b/${octave}`;
  }

  if (note.accidental === "n") {
    return `${lowerLetter}/${octave}`;
  }

  // Otherwise use key signature.
  const keyMap = KEY_SIGNATURE_ACCIDENTALS[keySignature] ?? {};
  const keyAccidental = keyMap[lowerLetter];

  if (keyAccidental) {
    return `${lowerLetter}${keyAccidental}/${octave}`;
  }

  return `${lowerLetter}/${octave}`;
}

export function yToPitch(
  y: number,
  topStaffLineY: number,
  bottomStaffLineY: number,
): string {
  // There are 4 gaps between the 5 staff lines.
  const staffLineSpacing = (bottomStaffLineY - topStaffLineY) / 4;

  // One pitch step is line-to-space or space-to-line.
  const pitchStep = staffLineSpacing / 2;

  // In treble clef:
  // f/5 is the top staff line.
  // c/6 is four pitch steps above f/5:
  // f/5 -> g/5 -> a/5 -> b/5 -> c/6
  const firstPitchY = topStaffLineY - 4 * pitchStep;

  // Browser y gets bigger as you move down.
  // Our pitch array also goes from high to low.
  const index = Math.round((y - firstPitchY) / pitchStep);

  const clampedIndex = Math.max(
    0,
    Math.min(PITCHES_TOP_TO_BOTTOM.length - 1, index),
  );

  return PITCHES_TOP_TO_BOTTOM[clampedIndex];
}
