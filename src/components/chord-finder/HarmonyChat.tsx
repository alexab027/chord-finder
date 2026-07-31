"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import type {
  CandidateMode,
  CandidateRole,
  CandidateSet,
} from "../../harmony/candidates/types";
import type { CurrentProgressionItem } from "../../music/progressionPresentation";

export type ChatMessage =
  | { id: string; kind: "text"; role: "user" | "assistant"; text: string }
  | {
      id: string;
      kind: "progression";
      heading: string;
      items: CurrentProgressionItem[];
    }
  | {
      id: string;
      kind: "explanation";
      overview: string;
      measures: Array<{ measure: number; chord: string; explanation: string }>;
    }
  | {
      id: string;
      kind: "candidates";
      candidateSetId: string;
      mode: CandidateMode;
      candidates: Array<{
        id: string;
        role: CandidateRole;
        items: CurrentProgressionItem[];
      }>;
    };

type CandidatePreviewSummary = Pick<
  CandidateSet,
  "id" | "previewedCandidateId" | "status"
>;

type HarmonyChatProps = {
  messages: readonly ChatMessage[];
  composerValue: string;
  placeholder: string;
  helperText: string;
  isGenerating: boolean;
  isExplaining: boolean;
  hasProgression: boolean;
  candidatePreview: CandidatePreviewSummary | null;
  error: string | null;
  onComposerChange: (value: string) => void;
  onSubmit: () => void;
  onPreviewCandidate: (candidateSetId: string, candidateId: string) => void;
  onSelectCandidate: (candidateSetId: string) => void;
  onCancelCandidate: (candidateSetId: string) => void;
};

const REVISION_CANDIDATE_ROLE_LABELS: Record<CandidateRole, string> = {
  closest: "Closest",
  moderate: "More Different",
  distinct: "Fresh Alternative",
};

function getCandidateRoleLabel(mode: CandidateMode, role: CandidateRole) {
  if (mode === "generate_new" && role === "closest") return "Best Fit";
  return REVISION_CANDIDATE_ROLE_LABELS[role];
}

function TextMessage({
  role,
  text,
}: {
  role: "user" | "assistant";
  text: string;
}) {
  const isUser = role === "user";

  return (
    <article
      className={
        isUser
          ? "bg-[var(--surface-subtle)] px-4 py-3"
          : "bg-[var(--surface)] px-4 py-4"
      }
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {isUser ? "You" : "Harmony"}
      </div>
      <p
        className={
          isUser
            ? "mt-1 whitespace-pre-wrap text-sm text-[var(--text)]"
            : "mt-1 whitespace-pre-wrap text-sm text-[var(--text-muted)]"
        }
      >
        {text}
      </p>
    </article>
  );
}

function ProgressionMessage({
  heading,
  items,
}: {
  heading: string;
  items: CurrentProgressionItem[];
}) {
  return (
    <article className="space-y-3 bg-[var(--surface)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Harmony
      </div>

      <div className="border-l-2 border-[var(--accent)] pl-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Progression snapshot
        </div>
        <div className="mt-1 font-semibold text-[var(--text)]">{heading}</div>
        <dl className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-[var(--text)]">Chords</dt>
            <dd>{items.map((item) => item.absoluteSymbol).join(" – ")}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-[var(--text)]">Roman numerals</dt>
            <dd>{items.map((item) => item.romanNumeral).join(" – ")}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function ExplanationMessage({
  overview,
  measures,
}: {
  overview: string;
  measures: Array<{ measure: number; chord: string; explanation: string }>;
}) {
  return (
    <article className="space-y-3 bg-[var(--surface)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Harmony
      </div>
      <div className="space-y-2 text-sm">
        <div className="font-semibold text-[var(--text)]">In plain English</div>
        {overview && <p className="text-[var(--text-muted)]">{overview}</p>}
        {measures.length > 0 && (
          <ul className="space-y-1 text-[var(--text-muted)]">
            {measures.map((measure) => (
              <li key={`explanation-${measure.measure}`}>
                <span className="font-medium text-[var(--text)]">
                  Measure {measure.measure} ({measure.chord}):
                </span>{" "}
                {measure.explanation}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function CandidateMessage({
  candidateSetId,
  mode,
  candidates,
  candidatePreview,
  onPreviewCandidate,
  onSelectCandidate,
  onCancelCandidate,
}: {
  candidateSetId: string;
  mode: CandidateMode;
  candidates: Extract<ChatMessage, { kind: "candidates" }>["candidates"];
  candidatePreview: CandidatePreviewSummary | null;
  onPreviewCandidate: (candidateSetId: string, candidateId: string) => void;
  onSelectCandidate: (candidateSetId: string) => void;
  onCancelCandidate: (candidateSetId: string) => void;
}) {
  const isCurrentSet = candidatePreview?.id === candidateSetId;
  const isPreviewing = isCurrentSet && candidatePreview.status === "previewing";

  return (
    <article className="space-y-3 bg-[var(--surface)] px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Harmony
      </div>
      <div>
        <div className="font-semibold text-[var(--text)]">
          Choose a progression
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Preview each option on the staff, then select one or cancel.
        </p>
      </div>

      <div className="grid gap-2">
        {candidates.map((candidate, index) => {
          const isPreviewed =
            isCurrentSet &&
            candidatePreview.previewedCandidateId === candidate.id;

          return (
            <button
              aria-pressed={isPreviewed}
              className={
                isPreviewed
                  ? "rounded-md border border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  : "rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-3 text-left hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              }
              disabled={!isPreviewing}
              key={candidate.id}
              onClick={() =>
                onPreviewCandidate(candidateSetId, candidate.id)
              }
              type="button"
            >
              <span className="block text-sm font-semibold text-[var(--text)]">
                Option {index + 1} — {getCandidateRoleLabel(mode, candidate.role)}
              </span>
              <span className="mt-1 block text-sm text-[var(--text-muted)]">
                {candidate.items
                  .map((item) => item.absoluteSymbol)
                  .join(" – ")}
              </span>
            </button>
          );
        })}
      </div>

      {isPreviewing ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="h-9 rounded-md border border-[var(--accent-border)] bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            onClick={() => onSelectCandidate(candidateSetId)}
            type="button"
          >
            Select
          </button>
          <button
            className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            onClick={() => onCancelCandidate(candidateSetId)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : (
        <p className="text-xs font-medium text-[var(--text-muted)]">
          {isCurrentSet && candidatePreview.status === "selected"
            ? "Selection committed."
            : "Preview closed."}
        </p>
      )}
    </article>
  );
}

function ChatEntry({
  message,
  candidatePreview,
  onPreviewCandidate,
  onSelectCandidate,
  onCancelCandidate,
}: {
  message: ChatMessage;
  candidatePreview: CandidatePreviewSummary | null;
  onPreviewCandidate: (candidateSetId: string, candidateId: string) => void;
  onSelectCandidate: (candidateSetId: string) => void;
  onCancelCandidate: (candidateSetId: string) => void;
}) {
  if (message.kind === "text") {
    return <TextMessage role={message.role} text={message.text} />;
  }
  if (message.kind === "progression") {
    return (
      <ProgressionMessage heading={message.heading} items={message.items} />
    );
  }
  if (message.kind === "candidates") {
    return (
      <CandidateMessage
        candidatePreview={candidatePreview}
        candidates={message.candidates}
        candidateSetId={message.candidateSetId}
        mode={message.mode}
        onCancelCandidate={onCancelCandidate}
        onPreviewCandidate={onPreviewCandidate}
        onSelectCandidate={onSelectCandidate}
      />
    );
  }
  return (
    <ExplanationMessage
      overview={message.overview}
      measures={message.measures}
    />
  );
}

export default function HarmonyChat({
  messages,
  composerValue,
  placeholder,
  helperText,
  isGenerating,
  isExplaining,
  hasProgression,
  candidatePreview,
  error,
  onComposerChange,
  onSubmit,
  onPreviewCandidate,
  onSelectCandidate,
  onCancelCandidate,
}: HarmonyChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const submitLabel = isGenerating
    ? hasProgression
      ? "Updating…"
      : "Generating…"
    : hasProgression
      ? "Update progression"
      : "Generate progression";
  const isPreviewingCandidates = candidatePreview?.status === "previewing";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isExplaining]);

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    if (!isGenerating && !isPreviewingCandidates) onSubmit();
  }

  return (
    <section className="w-full border-y border-[var(--border)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">
          Harmony conversation
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Generate a progression, ask a question, or request a revision.
        </p>
      </header>

      <div className="max-h-[28rem] overflow-y-auto">
        {messages.length === 0 && !isExplaining ? (
          <div className="px-4 py-8 text-sm text-[var(--text-muted)]">
            Your harmony requests and explanations will appear here.
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {messages.map((message) => (
              <ChatEntry
                candidatePreview={candidatePreview}
                key={message.id}
                message={message}
                onCancelCandidate={onCancelCandidate}
                onPreviewCandidate={onPreviewCandidate}
                onSelectCandidate={onSelectCandidate}
              />
            ))}
            {isExplaining && (
              <article className="bg-[var(--surface)] px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  Harmony
                </div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Writing a plain-English explanation…
                </p>
              </article>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-[var(--text)]">
            Describe the harmony you want
          </span>
          <span className="text-xs leading-5 text-[var(--text-muted)]">
            {helperText}
          </span>
          <textarea
            className="mt-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            maxLength={500}
            disabled={isPreviewingCandidates}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={placeholder}
            rows={3}
            value={composerValue}
          />
        </label>

        <button
          className={
            isGenerating || isPreviewingCandidates
              ? "mt-3 h-10 cursor-not-allowed rounded-md border border-[var(--border)] bg-[#ecece8] px-4 text-sm font-semibold text-[var(--text-muted)]"
              : "mt-3 h-10 rounded-md border border-[var(--accent-border)] bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          }
          disabled={isGenerating || isPreviewingCandidates}
          onClick={onSubmit}
          type="button"
        >
          {isPreviewingCandidates ? "Choose an option above" : submitLabel}
        </button>

        {error && <p className="mt-3 text-xs text-[var(--warning)]">{error}</p>}
      </div>
    </section>
  );
}
