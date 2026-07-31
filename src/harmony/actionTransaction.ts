import type { KeyContext, ScoredChord } from "../music/types";
import {
  applyChordEdit,
  HarmonyActionError,
  type ChordEditAction,
} from "./actions";
import { chordIdentityHash } from "./candidates/candidateHash";

function targetMeasure(action: ChordEditAction) {
  return action.type === "copy_chord" ? action.toMeasure : action.measure;
}

export function validateChordEditTransaction(
  actions: readonly ChordEditAction[],
  measureCount: number,
) {
  if (actions.length === 0) {
    throw new HarmonyActionError("The exact-edit transaction has no actions.");
  }

  const targets = new Set<number>();
  for (const action of actions) {
    const target = targetMeasure(action);
    if (!Number.isInteger(target) || target < 1 || target > measureCount) {
      throw new HarmonyActionError(
        `Target measure ${target} is out of range (expected 1-${measureCount}).`,
      );
    }
    if (targets.has(target)) {
      throw new HarmonyActionError(
        `Conflicting exact edits target measure ${target}. Nothing was changed.`,
      );
    }
    targets.add(target);

    if (
      action.type === "copy_chord" &&
      (!Number.isInteger(action.fromMeasure) ||
        action.fromMeasure < 1 ||
        action.fromMeasure > measureCount)
    ) {
      throw new HarmonyActionError(
        `Source measure ${action.fromMeasure} is out of range (expected 1-${measureCount}).`,
      );
    }
  }
}

export function applyChordEditTransaction(
  progression: readonly ScoredChord[],
  actions: readonly ChordEditAction[],
  context: { key: KeyContext },
): ScoredChord[] {
  validateChordEditTransaction(actions, progression.length);

  let temporary = [...progression];
  const expectedTargets = new Map<number, string>();
  for (const action of actions) {
    temporary = applyChordEdit(temporary, action, context);
    const target = targetMeasure(action);
    expectedTargets.set(
      target,
      chordIdentityHash(temporary[target - 1]),
    );
  }

  for (const [measure, expectedHash] of expectedTargets) {
    if (chordIdentityHash(temporary[measure - 1]) !== expectedHash) {
      throw new HarmonyActionError(
        `The exact edit for measure ${measure} failed its postcondition. Nothing was changed.`,
      );
    }
  }

  return temporary;
}
