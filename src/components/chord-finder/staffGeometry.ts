import { getKeySignatureExtraWidth } from "../../music/noteUtils";

export const STAFF_X = 20;
export const MELODY_STAFF_Y = 40;
export const CHORD_STAFF_Y = 190;
export const BASE_MEASURE_WIDTH = 300;
export const BASE_FIRST_MEASURE_EXTRA = 90;
export const MEASURE_COUNT = 4;
export const RENDERER_HEIGHT = 310;
export type StaffGeometry = ReturnType<typeof getStaffGeometry>;

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
export function getMeasureInfoFromClick(
  clickX: number,
  firstMeasureExtra: number,
) {
  const measureStarts = [
    STAFF_X,
    STAFF_X + BASE_MEASURE_WIDTH + firstMeasureExtra,
    STAFF_X + BASE_MEASURE_WIDTH + firstMeasureExtra + BASE_MEASURE_WIDTH,
    STAFF_X + BASE_MEASURE_WIDTH + firstMeasureExtra + BASE_MEASURE_WIDTH * 2,
  ];

  const measureWidths = [
    BASE_MEASURE_WIDTH + firstMeasureExtra,
    BASE_MEASURE_WIDTH,
    BASE_MEASURE_WIDTH,
    BASE_MEASURE_WIDTH,
  ];

  for (let i = 0; i < 4; i++) {
    const startX = measureStarts[i];
    const endX = startX + measureWidths[i];

    if (clickX >= startX && clickX <= endX) {
      return {
        measureIndex: i,
        startX,
        endX,
        width: measureWidths[i],
      };
    }
  }

  return null;
}
