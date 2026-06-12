import * as Tone from "tone";
import type { DurationName, PlacedChord, PlacedNote } from "../music/types";

type PlaybackRef<T> = {
  current: T | null;
};

function vexPitchToTonePitch(pitch: string) {
  const [name, octave] = pitch.split("/");

  const firstLetter = name[0].toUpperCase();
  const accidental = name.slice(1); // could be "", "#", or "b"

  return firstLetter + accidental + octave;
}

function durationToToneDuration(duration: DurationName) {
  if (duration === "w") return "1n";
  if (duration === "h") return "2n";
  if (duration === "q") return "4n";
  return "8n";
}

export async function playMeasuresAudio({
  measures,
  chordMeasures,
  bpm,
  getRenderedPitch,
  currentSamplerRef,
  currentPartRef,
}: {
  measures: PlacedNote[][];
  chordMeasures: PlacedChord[][];
  bpm: number;
  getRenderedPitch: (note: PlacedNote) => string;
  currentSamplerRef: PlaybackRef<Tone.Sampler>;
  currentPartRef: PlaybackRef<Tone.Part>;
}) {
  await Tone.start();

  if (currentPartRef.current) {
    currentPartRef.current.dispose();
    currentPartRef.current = null;
  }

  if (currentSamplerRef.current) {
    currentSamplerRef.current.dispose();
    currentSamplerRef.current = null;
  }

  Tone.Transport.stop();
  Tone.Transport.cancel();

  const piano = new Tone.Sampler({
    urls: {
      C4: "C4.mp3",
      "D#4": "Ds4.mp3",
      "F#4": "Fs4.mp3",
      A4: "A4.mp3",
    },
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).toDestination();

  currentSamplerRef.current = piano;

  await Tone.loaded();

  const safeBpm = Math.min(240, Math.max(40, bpm));
  Tone.Transport.bpm.value = safeBpm;

  const events: Array<{
    time: number;
    pitches: string[];
    duration: string;
  }> = [];

  const secondsPerBeat = 60 / safeBpm;
  const secondsPerEighth = secondsPerBeat / 2;

  measures.forEach((measureNotes, measureIndex) => {
    measureNotes.forEach((note) => {
      if (note.kind === "rest") return;

      const tonePitch = vexPitchToTonePitch(getRenderedPitch(note));
      const toneDuration = durationToToneDuration(note.duration);
      const totalEighthSlot = measureIndex * 8 + note.slot;
      const startTime = totalEighthSlot * secondsPerEighth;

      events.push({
        time: startTime,
        pitches: [tonePitch],
        duration: toneDuration,
      });
    });
  });

  chordMeasures.forEach((measureChords, measureIndex) => {
    measureChords.forEach((chord) => {
      const tonePitches = chord.pitches.map(vexPitchToTonePitch);
      const toneDuration = durationToToneDuration(chord.duration);
      const totalEighthSlot = measureIndex * 8 + chord.slot;
      const startTime = totalEighthSlot * secondsPerEighth;

      events.push({
        time: startTime,
        pitches: tonePitches,
        duration: toneDuration,
      });
    });
  });

  if (events.length === 0) {
    // Still reset playback state and ensure Transport is stopped.
    Tone.Transport.stop();
    return;
  }

  const part = new Tone.Part(
    (time, value: { pitches: string[]; duration: string }) => {
      piano.triggerAttackRelease(value.pitches, value.duration, time);
    },
    events
  );

  part.start(0);
  part.loop = false;
  currentPartRef.current = part;

  Tone.Transport.position = 0;
  Tone.Transport.start(undefined, 0);
}
