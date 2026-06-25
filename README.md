# Chord Finder

Compose a melody on a staff and let Chord Finder generate a four-measure chord progression to go with it — then hear it played back. Each generated chord comes with a plain-language explanation of *why* it was chosen.

## Features

- **Click-to-place notation** — add notes and rests (whole/half/quarter/eighth) with accidentals on a treble staff, rendered with [VexFlow](https://github.com/0xfe/vexflow).
- **Automatic chord generation** — a music-theory engine builds diatonic chord candidates (triads, 7ths, sus, add9, inversions), scores them against your melody, key, and a chosen style, and searches for the best-fitting progression.
- **Key & style control** — pick a key signature, generation mode (automatic / major / minor), and a style: simple, jazzy, bluesy, or descending bass.
- **"Why these chords?"** — every chord is annotated with its score and the reasoning behind it.
- **Playback** — hear the melody and chords together with an adjustable BPM, powered by [Tone.js](https://tonejs.github.io/).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

To create a production build:

```bash
npm run build
npm start
```

## How It Works

The app is organized into three layers:

- **UI** (`src/components/Staff.tsx`) — the interactive staff, toolbar, and rendering via VexFlow.
- **Music engine** (`src/music/`) — pure TypeScript with no React dependency:
  - `keyDetection.ts` — infers the key from your melody.
  - `chords.ts` — builds every diatonic chord candidate for a key.
  - `chordScoring.ts` — scores each chord on melody fit, key fit, style, and progression.
  - `chordGeneration.ts` — searches and ranks four-chord paths to choose a progression.
  - `noteUtils.ts` / `types.ts` — pitch math, voicing, and shared types.
- **Audio** (`src/audio/playback.ts`) — schedules and plays melody + chords with Tone.js.

Songs are fixed to four measures in 4/4 time.

## Tech Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS · VexFlow · Tone.js
