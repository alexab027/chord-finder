import { parsePitchToMidi } from "../../music/noteUtils";
import { buildExplanationIdentityItems } from "../../music/progressionPresentation";
import type { PlacedChord, ScoredChord } from "../../music/types";
export type ExplanationRequest = {
  activeKey: string;
  key: string;
  styleRequest: string;
  styleSummary: string;
  progression: Array<{
    measure: number;
    symbol: string;
    romanNumeral: string;
    score?: number;
    reasons: string[];
  }>;
};

function getVoicedBassMidiSequence(voicedProgression: PlacedChord[][]) {
  return voicedProgression.map((measure) => {
    const bassPitch = measure[0]?.pitches[0];
    return bassPitch ? (parsePitchToMidi(bassPitch) ?? null) : null;
  });
}

function reasonClaimsDescendingBass(reason: string) {
  return /\b(descending bass|bass line|bassline|bass downward|stepwise bass motion)\b/i.test(
    reason,
  );
}

function getGroundedExplanationReasons(
  scoredChord: ScoredChord,
  measureIndex: number,
  bassMidiSequence: Array<number | null>,
) {
  const currentBass = bassMidiSequence[measureIndex];
  const previousBass =
    measureIndex > 0 ? bassMidiSequence[measureIndex - 1] : null;
  const bassDescends =
    currentBass !== null && previousBass !== null && currentBass < previousBass;
  const reasons = scoredChord.reasons.filter(
    (reason) => bassDescends || !reasonClaimsDescendingBass(reason),
  );

  if (bassDescends) {
    reasons.push(
      `The final voiced bass moves downward from MIDI ${previousBass} to ${currentBass}.`,
    );
  }

  return reasons;
}
export function buildExplanationRequest(
  finalProgression: ScoredChord[],
  voicedProgression: PlacedChord[][],
  keyLabel: string,
  styleRequest: string,
  styleSummary: string,
): ExplanationRequest | null {
  if (finalProgression.length === 0) return null;

  const bassMidiSequence = getVoicedBassMidiSequence(voicedProgression);
  const identities = buildExplanationIdentityItems(finalProgression);

  return {
    activeKey: keyLabel,
    key: keyLabel,
    styleRequest,
    styleSummary,
    progression: finalProgression.map((scoredChord, index) => ({
      ...identities[index],
      score: scoredChord.score,
      reasons: getGroundedExplanationReasons(
        scoredChord,
        index,
        bassMidiSequence,
      ),
    })),
  };
}
