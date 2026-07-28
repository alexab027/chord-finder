import { getKeySignatureExtraWidth } from "../../music/noteUtils";

export const STAFF_X = 20;
export const MELODY_STAFF_Y = 40;
export const CHORD_STAFF_Y = 190;
export const BASE_MEASURE_WIDTH = 300;
export const BASE_FIRST_MEASURE_EXTRA = 90;
export const MEASURE_COUNT = 4;
export const RENDERER_HEIGHT = 310;

export function getStaffGeometry(keySignature: string) {
  const firstMeasureExtra =
    BASE_FIRST_MEASURE_EXTRA + getKeySignatureExtraWidth(keySignature);

  const rendererWidth =
    STAFF_X * 2 + BASE_MEASURE_WIDTH * MEASURE_COUNT + firstMeasureExtra;

  return {
    staffX: STAFF_X,
    melodyStaffY: MELODY_STAFF_Y,
    chordStaffY: CHORD_STAFF_Y,
    baseMeasureWidth: BASE_MEASURE_WIDTH,
    firstMeasureExtra,
    rendererWidth,
    rendererHeight: RENDERER_HEIGHT,
  };
}
