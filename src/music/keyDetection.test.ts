import { describe, expect, it } from "vitest";
import { getGenerationKey } from "./keyDetection";
import type { PlacedNote } from "./types";

function note(pitch: string, durationSlots = 2): PlacedNote {
  return {
    slot: 0,
    duration: durationSlots >= 4 ? "h" : durationSlots === 2 ? "q" : "8",
    durationSlots,
    pitch,
    kind: "note",
    accidental: null,
  };
}

function rest(pitch = "b/4"): PlacedNote {
  return {
    ...note(pitch),
    kind: "rest",
  };
}

const renderPitch = (placedNote: PlacedNote) => placedNote.pitch;

describe("automatic key detection", () => {
  it("infers C major from a clear C-major melody", () => {
    const measures = [[note("c/5"), note("e/5"), note("g/5"), note("c/6")]];

    expect(
      getGenerationKey("C", "automatic", measures, renderPitch),
    ).toMatchObject({ tonicName: "c", mode: "major" });
  });

  it("infers A minor from a clear A-minor melody", () => {
    const measures = [[note("a/4"), note("c/5"), note("e/5"), note("a/5")]];

    expect(
      getGenerationKey("C", "automatic", measures, renderPitch),
    ).toMatchObject({ tonicName: "a", mode: "minor" });
  });

  it("uses the final tonic bonus to distinguish reordered tonal material", () => {
    const endingOnA = [[note("c/5"), note("a/4")]];
    const endingOnC = [[note("a/4"), note("c/5")]];

    expect(
      getGenerationKey("C", "automatic", endingOnA, renderPitch).mode,
    ).toBe("minor");
    expect(
      getGenerationKey("C", "automatic", endingOnC, renderPitch).mode,
    ).toBe("major");
  });

  it("excludes rests even when their placeholder pitch suggests another tonic", () => {
    const melody = [[note("c/5", 4), rest("a/4"), rest("a/4")]];

    expect(
      getGenerationKey("C", "automatic", melody, renderPitch).mode,
    ).toBe("major");
  });

  it("does not let chromatic pitches outweigh a sustained tonic", () => {
    const melody = [[note("c/5", 4), note("f#/5", 1)]];

    expect(
      getGenerationKey("C", "automatic", melody, renderPitch).mode,
    ).toBe("major");
  });

  it("honors an explicit generation mode instead of inferring", () => {
    const melody = [[note("a/4"), note("e/5"), note("a/5")]];

    expect(getGenerationKey("C", "major", melody, renderPitch).mode).toBe(
      "major",
    );
  });
});
