import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HarmonyChat, {
  getComposerSubmissionBlock,
  type ChatMessage,
} from "./HarmonyChat";

const candidateMessage: ChatMessage = {
  id: "message-1",
  kind: "candidates",
  candidateSetId: "candidate-set-1",
  mode: "generate_new",
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
  it("blocks submission only while busy or awaiting a candidate decision", () => {
    expect(
      getComposerSubmissionBlock({
        isGenerating: true,
        isPreviewingCandidates: false,
      }),
    ).toBe("busy");
    expect(
      getComposerSubmissionBlock({
        isGenerating: false,
        isPreviewingCandidates: true,
      }),
    ).toBe("choose_candidate");
    expect(
      getComposerSubmissionBlock({
        isGenerating: false,
        isPreviewingCandidates: false,
      }),
    ).toBeNull();
  });

  it("shows three progression options with explanation, Select, and Cancel controls", () => {
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
        onExplainCandidate={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).toContain(">Best Fit</span>");
    expect(markup).toContain(">Alternate Best Fit</span>");
    expect(markup).toContain(">Unique Fit</span>");
    expect(markup).not.toContain("Option 1");
    expect(markup).toContain("C – G – Am – F");
    expect(markup).toContain(">Select</button>");
    expect(markup).toContain(">Why this option?</button>");
    expect(markup).toContain(">Cancel</button>");
    expect(markup).toContain('aria-label="Send harmony request"');
    expect(markup).not.toContain("Preview each option");
    expect(markup).not.toContain("Choose an option to open a fresh preview");
    expect(markup).not.toContain("Choose an option above.");
  });

  it("renders an honest candidate count below three", () => {
    const twoCandidateMessage: ChatMessage = {
      ...candidateMessage,
      candidates: candidateMessage.candidates.slice(0, 2),
    };
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
        messages={[twoCandidateMessage]}
        onCancelCandidate={noOp}
        onComposerChange={noOp}
        onExplainCandidate={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).toContain(">Best Fit</span>");
    expect(markup).toContain(">Alternate Best Fit</span>");
    expect(markup).not.toContain(">Unique Fit</span>");
  });

  it("uses the same concise role labels for revision candidates", () => {
    const revisionMessage: ChatMessage = {
      ...candidateMessage,
      mode: "revise_existing",
    };
    const markup = renderToStaticMarkup(
      <HarmonyChat
        candidatePreview={{
          id: "candidate-set-1",
          previewedCandidateId: "candidate-1",
          status: "previewing",
        }}
        composerValue=""
        error={null}
        hasProgression
        helperText="Helper"
        isExplaining={false}
        isGenerating={false}
        messages={[revisionMessage]}
        onCancelCandidate={noOp}
        onComposerChange={noOp}
        onExplainCandidate={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).toContain(">Best Fit</span>");
    expect(markup).not.toContain("Closest");
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
        onExplainCandidate={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).not.toContain("Selection committed");
    expect(markup).not.toContain(">Select</button>");
    expect(markup).not.toContain(">Cancel</button>");
    expect(markup).not.toContain(' disabled=""');
  });

  it("removes legacy structured-card headings", () => {
    const messages: ChatMessage[] = [
      {
        id: "progression",
        kind: "progression",
        heading: "Generated in C",
        items: candidateMessage.candidates[0].items,
      },
      {
        id: "explanation",
        kind: "explanation",
        overview: "The cadence resolves to C.",
        measures: [],
      },
    ];
    const markup = renderToStaticMarkup(
      <HarmonyChat
        candidatePreview={null}
        composerValue=""
        error={null}
        hasProgression
        helperText="Helper"
        isExplaining={false}
        isGenerating={false}
        messages={messages}
        onCancelCandidate={noOp}
        onComposerChange={noOp}
        onExplainCandidate={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(markup).toContain("Generated in C");
    expect(markup).toContain("The cadence resolves to C.");
    expect(markup).not.toContain("Progression snapshot");
    expect(markup).not.toContain("In plain English");
  });

  it("disables old options while a newer preview transaction is open", () => {
    const markup = renderToStaticMarkup(
      <HarmonyChat
        candidatePreview={{
          id: "candidate-set-2",
          previewedCandidateId: "candidate-1",
          status: "previewing",
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
        onExplainCandidate={noOp}
        onPreviewCandidate={noOp}
        onSelectCandidate={noOp}
        onSubmit={noOp}
        placeholder="Describe harmony"
      />,
    );

    expect(
      markup.match(/aria-pressed="false"[^>]* disabled=""/g),
    ).toHaveLength(3);
  });
});
