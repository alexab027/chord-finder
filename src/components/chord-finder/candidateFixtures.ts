import { deduplicateCandidates } from "../../harmony/candidates/candidateHash";
import type { CandidateRole } from "../../harmony/candidates/types";
import { buildKeyChords } from "../../music/chords";
import type {
  ChordCandidate,
  KeyContext,
  ScoredChord,
  StyleOption,
} from "../../music/types";

type CandidateFixture = {
  id: string;
  role: CandidateRole;
  progression: ScoredChord[];
};

const FIXTURE_PATHS: Record<KeyContext["mode"], number[][]> = {
  major: [
    [6, 4, 1, 5],
    [2, 5, 1, 6],
    [4, 1, 5, 6],
    [1, 4, 2, 5],
    [6, 2, 5, 1],
  ],
  minor: [
    [6, 3, 7, 1],
    [4, 5, 1, 6],
    [1, 6, 7, 3],
    [3, 6, 4, 5],
    [6, 4, 5, 1],
  ],
};

const ROLES: CandidateRole[] = ["closest", "moderate", "distinct"];

function scoreFixtureChord(chord: ChordCandidate): ScoredChord {
  return {
    chord,
    score: 0,
    reasons: [],
  };
}

function chooseFixtureChord(
  chords: ChordCandidate[],
  degree: number,
  style: StyleOption,
) {
  const candidates = chords.filter(
    (candidate) =>
      candidate.degree === degree &&
      (candidate.inversion ?? 0) === 0 &&
      candidate.bassPc === candidate.rootPc,
  );

  if (style === "jazzy") {
    return (
      candidates.find(
        (candidate) =>
          candidate.keyFit === "diatonic" &&
          ["maj7", "min7", "dom7"].includes(candidate.quality),
      ) ?? candidates.find((candidate) => candidate.quality === "add9")
    );
  }

  return candidates.find((candidate) => candidate.quality === "triad");
}

export function buildCandidateFixtures(
  key: KeyContext,
  style: StyleOption,
  primaryProgression: ScoredChord[],
): CandidateFixture[] {
  // Phase 3 intentionally proves preview/Select/Cancel state with deterministic
  // fixtures. Real pool ranking and candidate-role selection arrive in Phase 5.
  const progressions: ScoredChord[][] = [primaryProgression];
  const chords = buildKeyChords(key);

  for (const path of FIXTURE_PATHS[key.mode]) {
    const progression = path.flatMap((degree) => {
      const chord = chooseFixtureChord(chords, degree, style);
      return chord ? [scoreFixtureChord(chord)] : [];
    });
    if (progression.length !== 4) continue;

    progressions.push(progression);
  }

  return deduplicateCandidates(
    progressions.map((progression) => ({ progression })),
  )
    .slice(0, 3)
    .map(({ progression }, index) => ({
      id: `candidate-${index + 1}`,
      role: ROLES[index],
      progression,
    }));
}
