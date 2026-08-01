import { describe, expect, it } from "vitest";
import { candidateSetIdentity } from "./candidateSetIdentity";

const candidate = {
  id: "progression-a",
  symbolicHash: "progression-a",
  role: "closest" as const,
  progression: [],
  voicedProgression: [],
  totalScore: 1,
};

describe("candidateSetIdentity", () => {
  it("is stable for identical session, request, mode, and progression IDs", () => {
    const input = {
      sessionId: "session-1",
      requestId: "request-1",
      mode: "generate_new" as const,
      candidates: [candidate],
    };
    expect(candidateSetIdentity(input)).toBe(candidateSetIdentity(input));
  });

  it("changes for a new request even when candidates are reused", () => {
    expect(
      candidateSetIdentity({
        sessionId: "session-1",
        requestId: "request-1",
        mode: "generate_new",
        candidates: [candidate],
      }),
    ).not.toBe(
      candidateSetIdentity({
        sessionId: "session-1",
        requestId: "request-2",
        mode: "generate_new",
        candidates: [candidate],
      }),
    );
  });
});
