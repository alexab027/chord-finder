import {
  getCloseChordVoicingForPcs,
  getMeasureLowestMelodyMidi,
  parsePitchToMidi,
} from "./noteUtils";
import type {
  PlacedChord,
  PlacedNote,
  ScoredChord,
  StyleOption,
} from "./types";

// Pure projection of the musical progression (ScoredChord[]) into the
// rendered/voiced representation (PlacedChord[][]).
//
// This is the logic previously inlined in Staff.tsx (handleGenerateProgression);
// it is lifted verbatim so behavior is unchanged. Voicing is contextual: each
// measure's octave placement depends on that measure's lowest melody note and,
// on the descending-bass style, on the previous chord's bass. Because callers
// always re-derive the entire array from the current ScoredChord[], an edited
// chord automatically re-voices against its new neighbors.
export function voiceProgression(
  progression: ScoredChord[],
  measures: PlacedNote[][],
  getRenderedPitchFn: (note: PlacedNote) => string,
  style: StyleOption
): PlacedChord[][] {
  let previousBassMidi: number | undefined;

  return progression.map((scoredChord, measureIndex) => {
    const chord = scoredChord.chord;
    const lowestMelodyMidi = getMeasureLowestMelodyMidi(
      measures[measureIndex],
      getRenderedPitchFn
    );
    const pitches = getCloseChordVoicingForPcs(
      chord.pcs,
      chord.noteNames,
      lowestMelodyMidi,
      style === "descendingBass" ? previousBassMidi : undefined
    );

    previousBassMidi = parsePitchToMidi(pitches[0]) ?? previousBassMidi;

    return [
      {
        slot: 0,
        duration: "w",
        durationSlots: 8,
        pitches,
        symbol: chord.name,
        score: scoredChord.score,
        reasons: scoredChord.reasons,
      },
    ];
  });
}
