"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
  onExplainCandidate: (candidateSetId: string) => void;
  onCancelCandidate: (candidateSetId: string) => void;
};

export function getComposerSubmissionBlock({
  isGenerating,
  isPreviewingCandidates,
}: {
  isGenerating: boolean;
  isPreviewingCandidates: boolean;
}) {
  if (isGenerating) return "busy" as const;
  if (isPreviewingCandidates) return "choose_candidate" as const;
  return null;
}

const CANDIDATE_ROLE_LABELS: Record<CandidateRole, string> = {
  closest: "Best Fit",
  moderate: "Alternate Best Fit",
  distinct: "Unique Fit",
};

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
          ? "ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-[color-mix(in_srgb,var(--accent)_9%,white)] px-4 py-3"
          : "mr-auto max-w-[75%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3"
      }
    >
      <p
        className={
          isUser
            ? "whitespace-pre-wrap text-sm text-[var(--text)]"
            : "whitespace-pre-wrap text-sm text-[var(--text-muted)]"
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
    <article className="mr-auto w-full max-w-[75%] space-y-3 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4">
      <div className="border-l-2 border-[var(--accent)] pl-3">
        <div className="font-semibold text-[var(--text)]">{heading}</div>
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
    <article className="mr-auto w-full max-w-[75%] space-y-3 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4">
      <div className="space-y-2 text-sm">
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
  candidates,
  candidatePreview,
  onPreviewCandidate,
  onSelectCandidate,
  onExplainCandidate,
  onCancelCandidate,
}: {
  candidateSetId: string;
  candidates: Extract<ChatMessage, { kind: "candidates" }>["candidates"];
  candidatePreview: CandidatePreviewSummary | null;
  onPreviewCandidate: (candidateSetId: string, candidateId: string) => void;
  onSelectCandidate: (candidateSetId: string) => void;
  onExplainCandidate: (candidateSetId: string) => void;
  onCancelCandidate: (candidateSetId: string) => void;
}) {
  const isCurrentSet = candidatePreview?.id === candidateSetId;
  const isPreviewing = isCurrentSet && candidatePreview.status === "previewing";
  const anotherSetIsPreviewing =
    candidatePreview?.status === "previewing" && !isCurrentSet;

  return (
    <article className="mr-auto w-full max-w-[75%] space-y-3 rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-4">
      <div className="font-semibold text-[var(--text)]">
        Choose a progression
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {candidates.map((candidate) => {
          const isPreviewed =
            isCurrentSet &&
            candidatePreview.previewedCandidateId === candidate.id;

          return (
            <button
              aria-pressed={isPreviewed}
              className={
                isPreviewed
                  ? "w-80 shrink-0 rounded-md border border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_10%,white)] px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                  : "w-80 shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left hover:border-[var(--border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              }
              disabled={anotherSetIsPreviewing}
              key={candidate.id}
              onClick={() =>
                onPreviewCandidate(candidateSetId, candidate.id)
              }
              type="button"
            >
              <span className="block text-sm font-semibold text-[var(--text)]">
                {CANDIDATE_ROLE_LABELS[candidate.role]}
              </span>
              <span className="mt-1 block whitespace-nowrap text-sm text-[var(--text-muted)]">
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
            onClick={() => onExplainCandidate(candidateSetId)}
            type="button"
          >
            Why this option?
          </button>
          <button
            className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            onClick={() => onCancelCandidate(candidateSetId)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ChatEntry({
  message,
  candidatePreview,
  onPreviewCandidate,
  onSelectCandidate,
  onExplainCandidate,
  onCancelCandidate,
}: {
  message: ChatMessage;
  candidatePreview: CandidatePreviewSummary | null;
  onPreviewCandidate: (candidateSetId: string, candidateId: string) => void;
  onSelectCandidate: (candidateSetId: string) => void;
  onExplainCandidate: (candidateSetId: string) => void;
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
        onCancelCandidate={onCancelCandidate}
        onPreviewCandidate={onPreviewCandidate}
        onSelectCandidate={onSelectCandidate}
        onExplainCandidate={onExplainCandidate}
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
  candidatePreview,
  error,
  onComposerChange,
  onSubmit,
  onPreviewCandidate,
  onSelectCandidate,
  onExplainCandidate,
  onCancelCandidate,
}: HarmonyChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [blockedCandidateSetId, setBlockedCandidateSetId] = useState<
    string | null
  >(null);
  const isPreviewingCandidates = candidatePreview?.status === "previewing";
  const previewSubmitWarning =
    isPreviewingCandidates && blockedCandidateSetId === candidatePreview?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isExplaining]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "auto";
    const nextHeight = Math.min(composer.scrollHeight, 160);
    composer.style.height = `${nextHeight}px`;
    composer.style.overflowY = composer.scrollHeight > 160 ? "auto" : "hidden";
  }, [composerValue]);

  function attemptSubmit() {
    const block = getComposerSubmissionBlock({
      isGenerating,
      isPreviewingCandidates,
    });
    if (block === "busy") return;
    if (block === "choose_candidate") {
      setBlockedCandidateSetId(candidatePreview?.id ?? null);
      return;
    }
    setBlockedCandidateSetId(null);
    onSubmit();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    attemptSubmit();
  }

  return (
    <section className="w-full border-y border-[var(--border)] bg-[var(--surface)]">
      <div className="max-h-[28rem] overflow-y-auto">
        {messages.length === 0 && !isExplaining ? (
          <div className="px-4 py-8 text-sm text-[var(--text-muted)]">
            Your harmony requests and explanations will appear here.
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {messages.map((message) => (
              <ChatEntry
                candidatePreview={candidatePreview}
                key={message.id}
                message={message}
                onCancelCandidate={onCancelCandidate}
                onPreviewCandidate={onPreviewCandidate}
                onSelectCandidate={onSelectCandidate}
                onExplainCandidate={onExplainCandidate}
              />
            ))}
            {isExplaining && (
              <article className="mr-auto max-w-[75%] rounded-2xl rounded-bl-md border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3">
                <p className="text-sm text-[var(--text-muted)]">Explaining…</p>
              </article>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] p-4">
        <label className="flex flex-col gap-1">
          <span className="sr-only">Message</span>
          <span className="text-xs leading-5 text-[var(--text-muted)]">
            {helperText}
          </span>
          <div className="relative mt-1">
            <textarea
              ref={composerRef}
              className="block min-h-10 max-h-40 w-full resize-none overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 pr-14 text-sm leading-5 text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              maxLength={500}
              onChange={(event) => onComposerChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={placeholder}
              rows={1}
              value={composerValue}
            />
            <button
              aria-busy={isGenerating}
              aria-label="Send harmony request"
              className={
                isGenerating
                  ? "absolute bottom-1 right-1 flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-full border border-[var(--border)] bg-[#ecece8] text-lg font-semibold leading-none text-[var(--text-muted)]"
                  : "absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent-border)] bg-[var(--accent)] text-lg font-semibold leading-none text-white hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              }
              disabled={isGenerating}
              onClick={attemptSubmit}
              title="Send harmony request"
              type="button"
            >
              {isGenerating ? "…" : "↑"}
            </button>
          </div>
        </label>

        {previewSubmitWarning && (
          <p aria-live="polite" className="mt-2 text-xs text-[var(--warning)]">
            Choose an option above.
          </p>
        )}

        {error && <p className="mt-3 text-xs text-[var(--warning)]">{error}</p>}
      </div>
    </section>
  );
}
