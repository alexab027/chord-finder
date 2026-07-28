"use client";
import { useEffect, useRef, type RefObject } from "react";
import {
  GhostNote,
  Renderer,
  Stave,
  Voice,
  StaveNote,
  Formatter,
  Beam,
  Accidental,
} from "vexflow";

import type { PlacedNote, PlacedChord } from "../../music/types";
import { renderPitch } from "./pitchSpelling";
import type { StaffGeometry } from "./staffGeometry";

type StaffRendererProps = {
  measures: PlacedNote[][];
  chordMeasures: PlacedChord[][];
  keySignature: string;
  geometry: StaffGeometry;
  topStaffLineYRef: RefObject<number>;
  bottomStaffLineYRef: RefObject<number>;
};

export default function StaffRenderer({
  measures,
  chordMeasures,
  keySignature,
  geometry,
  topStaffLineYRef,
  bottomStaffLineYRef,
}: StaffRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    staffX,
    melodyStaffY,
    chordStaffY,
    baseMeasureWidth,
    firstMeasureExtra,
    rendererWidth,
    rendererHeight,
  } = geometry;

  function buildTickables(measureNotes: PlacedNote[]) {
    const tickables: (StaveNote | GhostNote)[] = [];

    let usedSlots = 0;

    for (const note of measureNotes) {
      const renderedPitch = renderPitch(note, keySignature);

      const staveNote = new StaveNote({
        keys: [renderedPitch],
        duration: note.kind === "rest" ? `${note.duration}r` : note.duration,
      });

      if (note.kind === "note" && note.accidental !== null) {
        staveNote.addModifier(new Accidental(note.accidental), 0);
      }

      tickables.push(staveNote);

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

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";

    const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);

    renderer.resize(rendererWidth, rendererHeight);

    const context = renderer.getContext();

    let currentX = staffX;

    const melodyStave1 = new Stave(
      currentX,
      melodyStaffY,
      baseMeasureWidth + firstMeasureExtra,
    );

    const chordStave1 = new Stave(
      currentX,
      chordStaffY,
      baseMeasureWidth + firstMeasureExtra,
    );

    currentX += baseMeasureWidth + firstMeasureExtra;

    const melodyStave2 = new Stave(currentX, melodyStaffY, baseMeasureWidth);
    const chordStave2 = new Stave(currentX, chordStaffY, baseMeasureWidth);

    currentX += baseMeasureWidth;

    const melodyStave3 = new Stave(currentX, melodyStaffY, baseMeasureWidth);
    const chordStave3 = new Stave(currentX, chordStaffY, baseMeasureWidth);

    currentX += baseMeasureWidth;

    const melodyStave4 = new Stave(currentX, melodyStaffY, baseMeasureWidth);
    const chordStave4 = new Stave(currentX, chordStaffY, baseMeasureWidth);

    melodyStave1
      .addClef("treble")
      .addKeySignature(keySignature)
      .addTimeSignature("4/4");

    chordStave1
      .addClef("bass")
      .addKeySignature(keySignature)
      .addTimeSignature("4/4");

    // Ask VexFlow where the melody staff lines actually are.
    // line 0 = top staff line
    // line 4 = bottom staff line
    topStaffLineYRef.current = melodyStave1.getYForLine(0);
    bottomStaffLineYRef.current = melodyStave1.getYForLine(4);

    const melodyStaves = [
      melodyStave1,
      melodyStave2,
      melodyStave3,
      melodyStave4,
    ];

    const chordStaves = [chordStave1, chordStave2, chordStave3, chordStave4];

    [...melodyStaves, ...chordStaves].forEach((stave) => {
      stave.setContext(context).draw();
    });

    function drawMeasure(measureNotes: PlacedNote[], stave: Stave) {
      const tickables = buildTickables(measureNotes);

      const voice = new Voice({
        numBeats: 4,
        beatValue: 4,
      });

      voice.addTickables(tickables);

      const noteStartX = stave.getNoteStartX();
      const noteEndX = stave.getNoteEndX();
      const formattingWidth = noteEndX - noteStartX - 10;

      new Formatter().joinVoices([voice]).format([voice], formattingWidth);

      const realNotes = tickables.filter(
        (tickable) => tickable instanceof StaveNote,
      ) as StaveNote[];

      // Generate beams BEFORE drawing the voice so eighth notes do not keep their flags/tails.
      const beams = Beam.generateBeams(realNotes);

      voice.draw(context, stave);

      beams.forEach((beam) => {
        beam.setContext(context).draw();
      });
    }

    function drawChordMeasure(chords: PlacedChord[], stave: Stave) {
      const tickables: (StaveNote | GhostNote)[] = [];

      let usedSlots = 0;

      for (const chord of chords) {
        tickables.push(
          new StaveNote({
            keys: chord.pitches,
            duration: chord.duration,
            clef: "bass",
          }),
        );

        usedSlots += chord.durationSlots;
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

      const voice = new Voice({
        numBeats: 4,
        beatValue: 4,
      });

      voice.addTickables(tickables);

      const noteStartX = stave.getNoteStartX();
      const noteEndX = stave.getNoteEndX();
      const formattingWidth = noteEndX - noteStartX - 10;

      new Formatter().joinVoices([voice]).format([voice], formattingWidth);

      voice.draw(context, stave);
    }

    measures.forEach((measureNotes, index) => {
      drawMeasure(measureNotes, melodyStaves[index]);
    });

    chordMeasures.forEach((chords, index) => {
      drawChordMeasure(chords, chordStaves[index]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measures, chordMeasures, keySignature, rendererWidth, firstMeasureExtra]);

  return <div ref={containerRef} />;
}
