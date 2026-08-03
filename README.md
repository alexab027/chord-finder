# Chord Finder

Chord Finder is an interactive harmony tool for turning a short melody into a playable four-measure chord progression. Write on the staff, generate harmony that fits, refine it in plain language, and hear the result.

## Features

- Compose a four-measure melody in 4/4 using whole, half, quarter, and eighth notes or rests.
- Add sharps, flats, and naturals, then choose a key signature and automatic, major, or minor mode.
- Generate ranked progression choices with a deterministic music-theory engine, then preview each option on the staff before selecting it.
- Compare honest `Best Fit`, `Alternate Best Fit`, and `Unique Fit` candidates; candidate sets may contain fewer than three options when fewer pass validation.
- Describe a simple or jazzy direction in plain language, including complexity, cadence, suspension, seventh-chord, and bass-motion preferences.
- Revise the committed progression conversationally or make exact measure edits such as replacing and copying chords.
- Keep exact chord constraints intact across every candidate while previewing changes without committing them.
- Detect jazziness and simplicity limits, then request structurally different alternatives at the same style level.
- Reopen earlier candidate choices from the conversation without losing the current committed progression.
- Ask for grounded progression, measure, transition, and candidate explanations based on deterministic musical facts.
- View chord symbols and Roman numerals alongside VexFlow notation, then play the melody and chords together at an adjustable tempo.

## Architecture

Chord Finder uses Groq to interpret language while a deterministic TypeScript
engine owns chord generation, scoring, validation, voicing, and state changes.

See [Architecture](docs/architecture.md) for the full system design.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Best-fit generation works locally without an AI service. To enable natural-language requests, revisions, and explanations, add a Groq API key and model to `.env.local`:

```env
GROQ_API_KEY=your_api_key
# Required shared model for interpretation and explanations
GROQ_MODEL=openai/gpt-oss-20b

# Required in production before Groq-backed requests are allowed
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
RATE_LIMIT_SALT=a_long_random_secret
```

Both AI routes use the Groq-hosted model configured by `GROQ_MODEL`. The request interpreter returns a strict typed schema, and the model does not choose or generate chords: candidate generation, scoring, validation, exact edits, previews, and style-boundary checks remain inside the deterministic music engine.

The Upstash settings enforce shared per-IP limits across both Groq routes. Tests
and ordinary local development bypass rate limiting when those settings are
absent; production blocks paid Groq calls until all three are configured.

## Usage

1. Select a note or rest duration and click the staff to build a melody.
2. Choose the key, mode, and tempo.
3. Leave the harmony request blank for the best fit, or describe the sound you want.
4. Preview a candidate, then select it to commit or cancel to restore the previous progression.
5. Refine the result with requests such as `make it jazzier`, `show different`, or `replace measure 2 with Am7`.
6. Reopen earlier choices, ask why a chord was used, or press **Play** to hear the melody and progression together.

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
