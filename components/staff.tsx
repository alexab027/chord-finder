"use client";

import { createSecureContext } from "node:tls";
import { useEffect, useRef } from "react";
import { Renderer, Stave, Voice, StaveNote, Formatter } from "vexflow";

export default function Staff() {
//ref for the container div where VexFlow will render the staff
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear old renders
    containerRef.current.innerHTML = "";

    // Create SVG renderer
    const renderer = new Renderer(
      containerRef.current,
      Renderer.Backends.SVG
    );

    renderer.resize(900, 220);

    const context = renderer.getContext();

    const firstMeasureExtra = 54; // extra space for clef and time signature
    let currentX = 10;
    const y = 40;
    const baseWidth = 206
    
    // create 4 staves for 4 measures
    const stave1 = new Stave(currentX, y, baseWidth + firstMeasureExtra);
    currentX += baseWidth + firstMeasureExtra;

    const stave2 = new Stave(currentX, y, baseWidth);
    currentX += baseWidth;
    const stave3 = new Stave(currentX, y, baseWidth);
    currentX += baseWidth;
    const stave4 = new Stave(currentX, y, baseWidth);

    // staff features
    stave1.addClef("treble").addTimeSignature("4/4");
    //draw staves at the end
    const allStaves = [stave1, stave2, stave3, stave4];
    allStaves.forEach(stave => {
        stave.setContext(context).draw();
    });

    // draw notes for each measure
    const measure1Notes = [
      new StaveNote({ keys: ["c/4"], duration: "q" }),
      new StaveNote({ keys: ["d/4"], duration: "q" }),
      new StaveNote({ keys: ["e/4"], duration: "q" }),
      new StaveNote({ keys: ["f/4"], duration: "q" }),
    ];

    const measure2Notes = [
      new StaveNote({ keys: ["g/4"], duration: "q" }),
      new StaveNote({ keys: ["a/4"], duration: "q" }),
      new StaveNote({ keys: ["b/4"], duration: "q" }),
      new StaveNote({ keys: ["c/5"], duration: "q" }),
    ];

    const measure3Notes = [
      new StaveNote({ keys: ["c/5"], duration: "h" }),
      new StaveNote({ keys: ["g/4"], duration: "h" }),
    ];

    const measure4Notes = [
      new StaveNote({ keys: ["f/4"], duration: "w" }),
    ];
    // helper function to draw a measure with given notes
    function drawMeasure(notes: StaveNote[], stave: Stave) {
      const voice = new Voice({
        num_beats: 4,
        beat_value: 4,
      });

      voice.addTickables(notes);

      new Formatter()
        .joinVoices([voice])
        .format([voice], baseWidth - 30);

      voice.draw(context, stave);
    }

    drawMeasure(measure1Notes, stave1);
    drawMeasure(measure2Notes, stave2);
    drawMeasure(measure3Notes, stave3);
    drawMeasure(measure4Notes, stave4);

  }, []);


//connects variable to actual div on the page
    return (
        <div className="bg-white border rounded-lg p-4 shadow">
            <div ref={containerRef} />
        </div>
  );
}