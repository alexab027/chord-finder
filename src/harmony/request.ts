import type {
  HarmonyRouterResponse,
  RevisionIntent,
} from "../ai/types";
import type { ChordEditAction } from "./actions";
import { validateChordEditTransaction } from "./actionTransaction";

export type HarmonyRequest =
  | { intent: "direct_edit"; actions: ChordEditAction[] }
  | {
      intent: "generate_new";
      interpretation: HarmonyRouterResponse;
      actions: ChordEditAction[];
    }
  | {
      intent: "revise_existing";
      interpretation: HarmonyRouterResponse;
      revision: RevisionIntent;
      actions: ChordEditAction[];
    }
  | {
      intent: "clarify";
      question: string;
    }
  | {
      intent: "answer_question";
      interpretation: HarmonyRouterResponse;
    };

function hasCreativeRevision(revision: RevisionIntent | undefined) {
  if (!revision) return false;
  return (
    revision.preserveOverallProgression === false ||
    revision.changeAmount !== 0.3 ||
    Object.keys(revision.requestedChanges).length > 0
  );
}

function promptRequestsCreativeChange(prompt: string) {
  return /\b(?:simpler|jazzier|simple|jazzy|richer|smoother|tenser|different|new|fresh|stronger cadence|descending bass)\b/i.test(
    prompt,
  );
}

export function directEditRequest(
  actions: ChordEditAction[],
  measureCount: number,
): HarmonyRequest {
  validateChordEditTransaction(actions, measureCount);
  return { intent: "direct_edit", actions };
}

export function normalizeHarmonyRequest({
  response,
  measureCount,
  prompt = "",
}: {
  response: HarmonyRouterResponse;
  measureCount: number;
  prompt?: string;
}): HarmonyRequest {
  const actions = response.actions ?? [];

  if (response.intent === "clarify") {
    return {
      intent: "clarify",
      question:
        response.clarificationQuestion ??
        "Could you clarify the complete harmony request?",
    };
  }
  if (response.intent === "answer_question") {
    return { intent: "answer_question", interpretation: response };
  }

  if (actions.length > 0) {
    try {
      validateChordEditTransaction(actions, measureCount);
    } catch (error) {
      return {
        intent: "clarify",
        question:
          error instanceof Error
            ? error.message
            : "The exact edits conflict, so nothing was changed.",
      };
    }
  }

  if (
    response.intent === "revise_existing" &&
    actions.length > 0 &&
    !hasCreativeRevision(response.revision) &&
    !promptRequestsCreativeChange(prompt)
  ) {
    return { intent: "direct_edit", actions };
  }
  if (response.intent === "generate_new") {
    return {
      intent: "generate_new",
      interpretation: response,
      actions,
    };
  }

  return {
    intent: "revise_existing",
    interpretation: response,
    revision: response.revision ?? {
      preserveOverallProgression: true,
      preserveChordPositions: [],
      changeAmount: 0.3,
      requestedChanges: {},
    },
    actions,
  };
}
