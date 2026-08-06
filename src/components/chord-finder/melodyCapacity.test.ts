import { describe, expect, it } from "vitest";
import type { PlacedNote } from "../../music/types";
import { canAppendDuration, getNextAvailableSlot } from "./melodyCapacity";

function note(slot: number, durationSlots: number): PlacedNote {
  return {
    slot,
    duration: durationSlots >= 4 ? "h" : durationSlots === 2 ? "q" : "8",
    durationSlots,
    pitch: "c/5",
    kind: "note",
    accidental: null,
  };
}

describe("legacy melody capacity", () => {
  it("starts an empty measure at slot zero", () => {
    expect(getNextAvailableSlot([])).toBe(0);
  });

  it("appends after the latest occupied end even if input order differs", () => {
    expect(getNextAvailableSlot([note(4, 2), note(0, 2)])).toBe(6);
  });

  it("allows a duration that exactly fills the measure", () => {
    expect(canAppendDuration([note(0, 4)], 4)).toBe(true);
  });

  it("rejects a duration that would overflow the measure", () => {
    expect(canAppendDuration([note(0, 4), note(4, 2)], 4)).toBe(false);
  });
});
