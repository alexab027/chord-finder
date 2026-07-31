import { useReducer, useRef } from "react";
import type { CandidateSet } from "../../harmony/candidates/types";

export type OpenCandidateSet = Omit<
  CandidateSet,
  "id" | "previewedCandidateId" | "status"
>;

export type CandidatePreviewAction =
  | { type: "open"; candidateSet: CandidateSet }
  | { type: "preview"; candidateSetId: string; candidateId: string }
  | { type: "select"; candidateSetId: string }
  | { type: "cancel"; candidateSetId: string }
  | { type: "clear" };

export function candidatePreviewReducer(
  state: CandidateSet | null,
  action: CandidatePreviewAction,
): CandidateSet | null {
  if (action.type === "open") return action.candidateSet;
  if (action.type === "clear") return null;
  if (!state || state.id !== action.candidateSetId) return state;

  if (action.type === "preview") {
    if (
      state.status !== "previewing" ||
      !state.candidates.some((candidate) => candidate.id === action.candidateId)
    ) {
      return state;
    }

    return { ...state, previewedCandidateId: action.candidateId };
  }

  if (state.status !== "previewing") return state;

  return {
    ...state,
    status: action.type === "select" ? "selected" : "cancelled",
  };
}

export function useCandidatePreview() {
  const [candidateSet, dispatch] = useReducer(candidatePreviewReducer, null);
  const candidateSetIdRef = useRef(0);

  function openCandidatePreview(input: OpenCandidateSet) {
    const firstCandidate = input.candidates[0];
    if (!firstCandidate) return null;

    candidateSetIdRef.current += 1;
    const nextCandidateSet: CandidateSet = {
      ...input,
      id: `candidate-set-${candidateSetIdRef.current}`,
      previewedCandidateId: firstCandidate.id,
      status: "previewing",
    };

    dispatch({ type: "open", candidateSet: nextCandidateSet });
    return nextCandidateSet;
  }

  function previewCandidate(candidateSetId: string, candidateId: string) {
    dispatch({ type: "preview", candidateSetId, candidateId });
  }

  function markCandidateSelected(candidateSetId: string) {
    dispatch({ type: "select", candidateSetId });
  }

  function markCandidateCancelled(candidateSetId: string) {
    dispatch({ type: "cancel", candidateSetId });
  }

  function clearCandidatePreview() {
    dispatch({ type: "clear" });
  }

  return {
    candidateSet,
    openCandidatePreview,
    previewCandidate,
    markCandidateSelected,
    markCandidateCancelled,
    clearCandidatePreview,
  };
}
