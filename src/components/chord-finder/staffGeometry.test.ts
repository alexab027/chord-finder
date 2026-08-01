import { describe, expect, it } from "vitest";
import {
  BASE_MEASURE_WIDTH,
  EDITOR_PANEL_WIDTH,
  getStaffGeometry,
  MAX_STAFF_RENDERER_WIDTH,
  MEASURE_COUNT,
  PLAYBACK_PANEL_WIDTH,
  STAFF_FRAME_WIDTH,
  STAFF_X,
} from "./staffGeometry";

describe("getStaffGeometry", () => {
  it("keeps equal left and right notation gutters", () => {
    const geometry = getStaffGeometry("C");
    const notationRightEdge =
      geometry.staffX +
      geometry.baseMeasureWidth * MEASURE_COUNT +
      geometry.firstMeasureExtra;

    expect(geometry.rendererWidth - notationRightEdge).toBe(STAFF_X);
  });

  it("uses the compact measure width", () => {
    expect(BASE_MEASURE_WIDTH).toBe(270);
    expect(getStaffGeometry("C").rendererWidth).toBeLessThan(1_250);
  });

  it("sizes the static frame for the widest supported key signature", () => {
    const supportedKeys = ["C", "G", "D", "A", "E", "B", "F", "Bb", "Eb", "Ab"];
    const widths = supportedKeys.map(
      (keySignature) => getStaffGeometry(keySignature).rendererWidth,
    );

    expect(MAX_STAFF_RENDERER_WIDTH).toBe(Math.max(...widths));
    expect(STAFF_FRAME_WIDTH).toBe(MAX_STAFF_RENDERER_WIDTH + 18);
    expect(EDITOR_PANEL_WIDTH).toBe(
      STAFF_FRAME_WIDTH + PLAYBACK_PANEL_WIDTH - 1,
    );
  });
});
