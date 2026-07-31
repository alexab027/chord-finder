import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HarmonyChat, { type ChatMessage } from "./HarmonyChat";

const candidateMessage: ChatMessage = {
  id: "message-1",
  kind: "candidates",
  candidateSetId: "candidate-set-1",
  candidates: [
    {
      id: "candidate-1",
      role: "closest",
      items: [
        { measure: 1, absoluteSymbol: "C", romanNumeral: "I" },
        { measure: 2, absoluteSymbol: "G", romanNumeral: "V" },
        { measure: 3, absoluteSymbol: "Am", romanNumeral: "vi" },
        { measure: 4, absoluteSymbol: "F", romanNumeral: "IV" },
      ],
    },
    {
      id: "candidate-2",
      role: "moderate",
      items: [
        { measure: 1, absoluteSymbol: "Am", romanNumeral: "vi" },
        { measure: 2, absoluteSymbol: "F", romanNumeral: "IV" },
        { measure: 3, absoluteSymbol: "C", romanNumeral: "I" },
        { measure: 4, absoluteSymbol: "G", romanNumeral: "V" },
      ],
    },
    {
      id: "candidate-3",
      role: "distinct",
      items: [
        { measure: 1, absoluteSymbol: "Dm", romanNumeral: "ii" },
        { measure: 2, absoluteSymbol: "G", romanNumeral: "V" },
        { measure: 3, absoluteSymbol: "C", romanNumeral: "I" },
        { measure: 4, absoluteSymbol: "Am", romanNumeral: "vi" },
      ],
    },
  ],
};

const noOp = () => {};

describe("HarmonyChat candidate controls", () => {
  it("shows three progression options with Select and Cancel", () => {
    const markup = renderToStaticMarkup(
      <HarmonyChat
        candidatePreview={{
          id: "candidate-set-1",
          previewedCandidateId: "candidate-1",
          status: "previewing",
        }}
        composerValue=""
        error={null}
        hasProgression={false}
        helperText="Helper"
        isExplaining={false}
        isGenerating={false}
        messages={[candidateMessage]}
        onCancelCandidate={noOp}
        onComposerChange={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).toContain("Option 1 — Closest");
    expect(markup).toContain("Option 2 — More Different");
    expect(markup).toContain("Option 3 — Fresh Alternative");
    expect(markup).toContain("C – G – Am – F");
    expect(markup).toContain(">Select</button>");
    expect(markup).toContain(">Cancel</button>");
    expect(markup).toContain("Choose an option above");
  });

  it("closes the action controls after selection", () => {
    const markup = renderToStaticMarkup(
      <HarmonyChat
        candidatePreview={{
          id: "candidate-set-1",
          previewedCandidateId: "candidate-2",
          status: "selected",
        }}
        composerValue=""
        error={null}
        hasProgression
        helperText="Helper"
        isExplaining={false}
        isGenerating={false}
        messages={[candidateMessage]}
        onCancelCandidate={noOp}
        onComposerChange={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).toContain("Selection committed.");
    expect(markup).not.toContain(">Select</button>");
    expect(markup).not.toContain(">Cancel</button>");
  });
});
