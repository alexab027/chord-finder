"use client";

import { useEffect, useRef, useState } from "react";
import {
  GhostNote,
  Renderer,
  Stave,
  Voice,
  StaveNote,
  Formatter,
  Beam,
} from "vexflow";

type DurationName = "w" | "h" | "q" | "8";

type PlacedNote = {
  slot: number;
  duration: DurationName;
  durationSlots: number;
  pitch: string;
};

const DURATION_TO_SLOTS: Record<DurationName, number> = {
  w: 8,
  h: 4,
  q: 2,
  "8": 1,
};

// simple treble-clef pitch map, top to bottom
const PITCHES_TOP_TO_BOTTOM = [
  "c/6",
  "b/5",
  "a/5",
  "g/5",
  "f/5",
  "e/5",
  "d/5",
  "c/5",
  "b/4",
  "a/4",
  "g/4",
  "f/4",
  "e/4",
  "d/4",
  "c/4",
  "b/3",
  "a/3",
  "g/3",
];

export default function Staff() {
  const containerRef = useRef<HTMLDivElement>(null);
  const staffWrapperRef = useRef<HTMLDivElement>(null);

  // Stores the real top and bottom staff line y-values from VexFlow
  const topStaffLineYRef = useRef<number>(40);
  const bottomStaffLineYRef = useRef<number>(80);

  const [selectedDuration, setSelectedDuration] =
    useState<DurationName>("q");

  const [measures, setMeasures] = useState<PlacedNote[][]>([
    [],
    [],
    [],
    [],
  ]);

  const staffX = 20;
  const staffY = 40;
  const firstMeasureExtra = 54;
  const baseMeasureWidth = 240;
  const rendererWidth = 1040;
  const rendererHeight = 180;
  const staffHeight = 80;

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const renderer = new Renderer(
      containerRef.current,
      Renderer.Backends.SVG
    );

    renderer.resize(rendererWidth, rendererHeight);

    const context = renderer.getContext();

    let currentX = staffX;

    const stave1 = new Stave(
      currentX,
      staffY,
      baseMeasureWidth + firstMeasureExtra
    );

    currentX += baseMeasureWidth + firstMeasureExtra;

    const stave2 = new Stave(currentX, staffY, baseMeasureWidth);
    currentX += baseMeasureWidth;

    const stave3 = new Stave(currentX, staffY, baseMeasureWidth);
    currentX += baseMeasureWidth;

    const stave4 = new Stave(currentX, staffY, baseMeasureWidth);

    stave1.addClef("treble").addTimeSignature("4/4");

    // Ask VexFlow where the staff lines actually are.
    // line 0 = top staff line
    // line 4 = bottom staff line
    topStaffLineYRef.current = stave1.getYForLine(0);
    bottomStaffLineYRef.current = stave1.getYForLine(4);

    const staves = [stave1, stave2, stave3, stave4];

    staves.forEach((stave) => {
      stave.setContext(context).draw();
    });

    measures.forEach((measureNotes, index) => {
      const isFirstMeasure = index === 0;
      drawMeasure(measureNotes, staves[index], isFirstMeasure);
    });

    function drawMeasure(
      measureNotes: PlacedNote[],
      stave: Stave,
      isFirstMeasure: boolean
    ) {
      const tickables = buildTickables(measureNotes);

      const voice = new Voice({
        num_beats: 4,
        beat_value: 4,
      });

      voice.addTickables(tickables);

      const formattingWidth = isFirstMeasure
        ? stave.getWidth() - firstMeasureExtra - 45
        : stave.getWidth() - 45;

      new Formatter()
        .joinVoices([voice])
        .format([voice], formattingWidth);

      const realNotes = tickables.filter(
        (tickable) => tickable instanceof StaveNote
      ) as StaveNote[];

      // Generate beams BEFORE drawing the voice so eighth notes do not keep their flags/tails.
      const beams = Beam.generateBeams(realNotes);

      voice.draw(context, stave);

      beams.forEach((beam) => {
        beam.setContext(context).draw();
      });
    }
  }, [measures]);

  function buildTickables(measureNotes: PlacedNote[]) {
    const tickables: (StaveNote | GhostNote)[] = [];

    let usedSlots = 0;

    for (const note of measureNotes) {
      tickables.push(
        new StaveNote({
          keys: [note.pitch],
          duration: note.duration,
        })
      );

      usedSlots += note.durationSlots;
    }

    let remainingSlots = 8 - usedSlots;

    while (remainingSlots > 0) {
      if (remainingSlots >= 4) {
        tickables.push(new GhostNote("h"));
        remainingSlots -= 4;
      } else if (remainingSlots >= 2) {
        tickables.push(new GhostNote("q"));
        remainingSlots -= 2;
      } else {
        tickables.push(new GhostNote("8"));
        remainingSlots -= 1;
      }
    }

    return tickables;
  }

  function getNextAvailableSlot(measureNotes: PlacedNote[]) {
    let nextSlot = 0;

    for (const note of measureNotes) {
      const noteEnd = note.slot + note.durationSlots;
      nextSlot = Math.max(nextSlot, noteEnd);
    }

    return nextSlot;
  }

  function getMeasureInfoFromClick(clickX: number) {
    const measureStarts = [
      staffX,
      staffX + baseMeasureWidth + firstMeasureExtra,
      staffX + baseMeasureWidth + firstMeasureExtra + baseMeasureWidth,
      staffX + baseMeasureWidth + firstMeasureExtra + baseMeasureWidth * 2,
    ];

    const measureWidths = [
      baseMeasureWidth + firstMeasureExtra,
      baseMeasureWidth,
      baseMeasureWidth,
      baseMeasureWidth,
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

  function handleStaffClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!staffWrapperRef.current) return;

    const rect = staffWrapperRef.current.getBoundingClientRect();

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const measureInfo = getMeasureInfoFromClick(clickX);

    if (!measureInfo) return;

    const pitch = yToPitch(clickY);
    const durationSlots = DURATION_TO_SLOTS[selectedDuration];

    console.log("clickY:", clickY, "pitch:", pitch);

    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);

      const measureNotes = newMeasures[measureInfo.measureIndex];

      const nextSlot = getNextAvailableSlot(measureNotes);

      if (nextSlot + durationSlots > 8) {
        console.log("Note does not fit in this measure.");
        return prevMeasures;
      }

      const newNote: PlacedNote = {
        slot: nextSlot,
        duration: selectedDuration,
        durationSlots,
        pitch,
      };

      newMeasures[measureInfo.measureIndex] = [
        ...measureNotes,
        newNote,
      ];

      return newMeasures;
    });
  }

  function yToPitch(y: number) {
    const topStaffLineY = topStaffLineYRef.current;
    const bottomStaffLineY = bottomStaffLineYRef.current;

    // There are 4 gaps between the 5 staff lines.
    const staffLineSpacing = (bottomStaffLineY - topStaffLineY) / 4;

    // One pitch step is line-to-space or space-to-line.
    const pitchStep = staffLineSpacing / 2;

    // In treble clef:
    // f/5 is the top staff line.
    // c/6 is four pitch steps above f/5:
    // f/5 -> g/5 -> a/5 -> b/5 -> c/6
    const firstPitchY = topStaffLineY - 4 * pitchStep;

    // Browser y gets bigger as you move down.
    // Our pitch array also goes from high to low.
    const index = Math.round((y - firstPitchY) / pitchStep);

    const clampedIndex = Math.max(
      0,
      Math.min(PITCHES_TOP_TO_BOTTOM.length - 1, index)
    );

    console.log({
      y,
      topStaffLineY,
      bottomStaffLineY,
      staffLineSpacing,
      pitchStep,
      index,
      pitch: PITCHES_TOP_TO_BOTTOM[clampedIndex],
    });

    return PITCHES_TOP_TO_BOTTOM[clampedIndex];
}
  

  function deleteLastNote() {
    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);

      for (let i = newMeasures.length - 1; i >= 0; i--) {
        if (newMeasures[i].length > 0) {
          newMeasures[i] = newMeasures[i].slice(0, -1);
          break;
        }
      }

      return newMeasures;
    });
  }

  function clearAllMeasures() {
    setMeasures([[], [], [], []]);
  }

  function clearMeasure(index: number) {
    setMeasures((prevMeasures) => {
      const newMeasures = prevMeasures.map((measure) => [...measure]);
      newMeasures[index] = [];
      return newMeasures;
    });
  }
  function durationButtonClass(duration: DurationName) {
  return selectedDuration === duration
    ? "bg-gray-800 text-white border border-gray-900 rounded px-3 py-1"
    : "bg-gray-200 text-black border border-gray-500 rounded px-3 py-1 hover:bg-gray-300";
  }
  function clearMeasureButtonClass(measureIndex: number) {
    return measures[measureIndex].length > 0
      ? "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400 cursor-not-allowed";
  }
  function clearAllButtonClass() {
    const hasNotes = measures.some((measure) => measure.length > 0);
    return hasNotes
      ? "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400 cursor-not-allowed";
  }
  function deleteLastButtonClass() {    const hasNotes = measures.some((measure) => measure.length > 0);
    return hasNotes
      ? "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400"
      : "border border-gray-300 rounded px-3 py-1 text-sm text-gray-400 cursor-not-allowed";
  }
  return (
    <div className="bg-white border rounded-lg p-4 shadow space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedDuration("w")}
          className={durationButtonClass("w")}
        >
          Whole
        </button>

        <button
          onClick={() => setSelectedDuration("h")}
          className={durationButtonClass("h")}>
          Half
        </button>

        <button
          onClick={() => setSelectedDuration("q")}
          className={durationButtonClass("q")}        
          >Quarter
        </button>

        <button
          onClick={() => setSelectedDuration("8")}
          className={durationButtonClass("8")}>
          Eighth
        </button>

        <button
          onClick={deleteLastNote}
          className={deleteLastButtonClass()}
        >
          Delete Last
        </button>

        <button
          onClick={clearAllMeasures}
          className= {clearAllButtonClass()}
        >
          Clear All
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => clearMeasure(0)}
          className={clearMeasureButtonClass(0)}
        >
          Clear M1
        </button>

        <button
          onClick={() => clearMeasure(1)}
          className= {clearMeasureButtonClass(1)}
        >
          Clear M2
        </button>

        <button
          onClick={() => clearMeasure(2)}
          className= {clearMeasureButtonClass(2)}
        >
          Clear M3
        </button>

        <button
          onClick={() => clearMeasure(3)}
          className= {clearMeasureButtonClass(3)}
        >
          Clear M4
        </button>
      </div>

    

      <div
        ref={staffWrapperRef}
        onClick={handleStaffClick}
        className="cursor-crosshair"
        style={{
          width: rendererWidth,
          height: rendererHeight,
          position: "relative",
        }}
      >
        <div ref={containerRef} />
      </div>
    </div>
  );
}