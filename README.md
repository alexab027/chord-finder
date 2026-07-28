# Chord Finder

Chord Finder is an interactive harmony tool for turning a short melody into a playable four-measure chord progression. Write on the staff, generate harmony that fits, refine it in plain language, and hear the result.

## Features

- Compose a four-measure melody in 4/4 using whole, half, quarter, and eighth notes or rests.
- Add sharps, flats, and naturals, then choose a key signature and automatic, major, or minor mode.
- Generate a best-fit progression with a deterministic music-theory engine.
- Describe a style or mood in plain language, including jazz, blues, complexity, cadence, and bass-motion preferences.
- Revise an existing progression conversationally or make exact edits such as replacing or copying a chord.
- Ask for a plain-English explanation of the current progression.
- View chord symbols and Roman numerals alongside standard notation.
- Play the melody and chords together at an adjustable tempo.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Best-fit generation works locally without an AI service. To enable natural-language requests, revisions, and explanations, add a Groq API key to `.env.local`:

```env
GROQ_API_KEY=your_api_key
# Optional
GROQ_MODEL=llama-3.1-8b-instant
```

## Usage

1. Select a note or rest duration and click the staff to build a melody.
2. Choose the key, mode, and tempo.
3. Leave the harmony request blank for the best fit, or describe the sound you want.
4. Refine the result with requests such as `make it jazzier` or `replace measure 2 with Am7`.
5. Press **Play** to hear the melody and progression together.

## Commands

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm start        # Run the production server
npm run lint     # Run ESLint
npm test         # Run the test suite
```

## Tech Stack

Next.js 16, React 19, TypeScript, Tailwind CSS, VexFlow, Tone.js, Groq, and Vitest.
