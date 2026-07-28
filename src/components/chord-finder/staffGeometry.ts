import { getKeySignatureExtraWidth } from "../../music/noteUtils";

const STAFF_X = 20;
const MELODY_STAFF_Y = 40;
const CHORD_STAFF_Y = 190;
const BASE_FIRST_MEASURE_EXTRA = 90;
const BASE_MEASURE_WIDTH = 300;
const MEASURE_COUNT = 4;
const RENDERER_HEIGHT = 310;

export function getStaffGeometry(keySignature: string) {
  const firstMeasureExtra =
    BASE_FIRST_MEASURE_EXTRA + getKeySignatureExtraWidth(keySignature);
  const rendererWidth =
    STAFF_X * 2 + BASE_MEASURE_WIDTH * MEASURE_COUNT + firstMeasureExtra;

  return {
    staffX: STAFF_X,
    melodyStaffY: MELODY_STAFF_Y,
    chordStaffY: CHORD_STAFF_Y,
    firstMeasureExtra,
    baseMeasureWidth: BASE_MEASURE_WIDTH,
    rendererWidth,
    rendererHeight: RENDERER_HEIGHT,
  };
}
