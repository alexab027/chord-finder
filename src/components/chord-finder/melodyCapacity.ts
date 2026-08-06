import type { PlacedNote } from "../../music/types";

export const LEGACY_MEASURE_SLOT_COUNT = 8;

export function getNextAvailableSlot(measureNotes: readonly PlacedNote[]) {
  return measureNotes.reduce(
    (nextSlot, note) => Math.max(nextSlot, note.slot + note.durationSlots),
    0,
  );
}

export function canAppendDuration(
  measureNotes: readonly PlacedNote[],
  durationSlots: number,
) {
  return (
    getNextAvailableSlot(measureNotes) + durationSlots <=
    LEGACY_MEASURE_SLOT_COUNT
  );
}
