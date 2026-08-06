import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlacedChord, PlacedNote } from "../music/types";

const tone = vi.hoisted(() => ({
  events: [] as Array<{
    time: number;
    pitches: string[];
    duration: string;
  }>,
  partStart: vi.fn(),
  samplerDispose: vi.fn(),
  partDispose: vi.fn(),
  transportStart: vi.fn(),
  transportStop: vi.fn(),
  transportCancel: vi.fn(),
  triggerAttackRelease: vi.fn(),
}));

vi.mock("tone", () => {
  class Sampler {
    toDestination() {
      return this;
    }

    dispose() {
      tone.samplerDispose();
    }

    triggerAttackRelease(...args: unknown[]) {
      tone.triggerAttackRelease(...args);
    }
  }

  class Part {
    loop = false;

    constructor(
      _callback: unknown,
      events: typeof tone.events,
    ) {
      tone.events = events;
    }

    start(...args: unknown[]) {
      tone.partStart(...args);
      return this;
    }

    dispose() {
      tone.partDispose();
    }
  }

  return {
    start: vi.fn().mockResolvedValue(undefined),
    loaded: vi.fn().mockResolvedValue(undefined),
    Sampler,
    Part,
    Transport: {
      bpm: { value: 90 },
      position: 0,
      start: tone.transportStart,
      stop: tone.transportStop,
      cancel: tone.transportCancel,
    },
  };
});

import { playMeasuresAudio } from "./playback";

function note(
  pitch: string,
  slot: number,
  duration: PlacedNote["duration"],
  durationSlots: number,
  kind: PlacedNote["kind"] = "note",
): PlacedNote {
  return { pitch, slot, duration, durationSlots, kind, accidental: null };
}

function chord(
  pitches: string[],
  slot: number,
  duration: PlacedChord["duration"],
  durationSlots: number,
): PlacedChord {
  return { pitches, slot, duration, durationSlots, symbol: "test" };
}

describe("playback scheduling", () => {
  beforeEach(() => {
    tone.events = [];
    vi.clearAllMocks();
  });

  it("preserves note durations, measure offsets, rest omission, and chord events", async () => {
    const samplerRef = { current: null };
    const partRef = { current: null };

    await playMeasuresAudio({
      measures: [
        [
          note("c/5", 0, "q", 2),
          note("d/5", 2, "8", 1),
          note("b/4", 3, "8", 1, "rest"),
        ],
        [note("eb/5", 0, "h", 4)],
      ],
      chordMeasures: [
        [chord(["c/3", "e/3", "g/3"], 0, "w", 8)],
        [],
      ],
      bpm: 120,
      getRenderedPitch: (placedNote) => placedNote.pitch,
      currentSamplerRef: samplerRef,
      currentPartRef: partRef,
    });

    expect(tone.events).toEqual([
      { time: 0, pitches: ["C5"], duration: "4n" },
      { time: 0.5, pitches: ["D5"], duration: "8n" },
      { time: 2, pitches: ["Eb5"], duration: "2n" },
      { time: 0, pitches: ["C3", "E3", "G3"], duration: "1n" },
    ]);
    expect(tone.partStart).toHaveBeenCalledWith(0);
    expect(tone.transportStart).toHaveBeenCalledWith(undefined, 0);
  });

  it("does not create a part when there are no sounding events", async () => {
    const samplerRef = { current: null };
    const partRef = { current: null };

    await playMeasuresAudio({
      measures: [[note("b/4", 0, "w", 8, "rest")]],
      chordMeasures: [[]],
      bpm: 90,
      getRenderedPitch: (placedNote) => placedNote.pitch,
      currentSamplerRef: samplerRef,
      currentPartRef: partRef,
    });

    expect(tone.events).toEqual([]);
    expect(partRef.current).toBeNull();
    expect(tone.transportStart).not.toHaveBeenCalled();
  });
});
