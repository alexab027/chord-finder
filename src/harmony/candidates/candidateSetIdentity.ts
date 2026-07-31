import type { CandidateMode, ProgressionCandidate } from "./types";

function stableTextHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function candidateSetIdentity(input: {
  sessionId: string;
  requestId: string;
  mode: CandidateMode;
  candidates: readonly ProgressionCandidate[];
}) {
  const content = [
    input.sessionId,
    input.requestId,
    input.mode,
    ...input.candidates.map(({ symbolicHash }) => symbolicHash),
  ].join("|");
  return `candidate-set-${stableTextHash(content)}`;
}
