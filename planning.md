# AI Implementation Instructions: Groq-Powered Style Interpretation for Music Copilot

## Objective

Modify the existing Music Copilot project so that:

1. The user can describe the desired harmony in natural language.
2. A server-side Groq API route converts that description into validated, structured generation preferences.
3. The existing deterministic music-theory engine remains responsible for selecting, scoring, voicing, and rendering the actual chords.
4. The existing engine-generated reasons remain visible immediately.
5. A separate optional Groq API route can rewrite those grounded reasons into a concise plain-English explanation.
6. The app continues to work when Groq is unavailable by falling back to the existing style dropdown and deterministic engine.

Do not replace the music-theory engine with an LLM. Do not ask Groq to invent or directly choose chord progressions.

---

## Existing Architecture to Preserve

The project currently has these main layers:

```text
src/components/Staff.tsx
    React state, controls, VexFlow rendering, orchestration

src/music/
    Pure TypeScript music-theory engine

src/audio/playback.ts
    Tone.js scheduling and playback
```

Preserve the separation between UI, music logic, and audio.

Before editing, inspect the actual types and function signatures in:

```text
src/music/types.ts
src/music/chordScoring.ts
src/music/chordGeneration.ts
src/music/chords.ts
src/music/keyDetection.ts
src/components/Staff.tsx
```

Adapt all code to the real names already used in the repository. Do not blindly introduce duplicate types or parallel generation functions.

---

## Required New Structure

Create these files:

```text
src/ai/types.ts
src/ai/toGenerationPreferences.ts
app/api/interpret-style/route.ts
app/api/explain-progression/route.ts
```

Modify these existing files as needed:

```text
src/music/types.ts
src/music/chordScoring.ts
src/music/chordGeneration.ts
src/components/Staff.tsx
```

Do not expose the Groq API key in client code.

---

# Phase 1: Inspect the Existing Project

Before making changes:

1. Locate the current `StyleOption`, `ChordQuality`, `ScoredChord`, `PlacedChord`, `KeyContext`, and scoring-context types.
2. Locate the current `generateChords` function in `Staff.tsx`.
3. Locate the current signature of `chooseProgression`.
4. Locate where per-chord style scoring occurs.
5. Locate where cadence/path scoring occurs.
6. Locate the existing human-readable `reasons` fields.
7. Locate the fields used to identify:
   - chord symbol
   - Roman numeral
   - inversion
   - bass pitch
   - chord quality
   - score
8. Preserve existing behavior when no text prompt is supplied.

Do not proceed by guessing field names. Reuse the repository's actual domain model.

---

# Phase 2: Add AI Domain Types

Create:

```text
src/ai/types.ts
```

Define:

```ts
import type { StyleOption } from "@/src/music/types";

export type InterpretedStyle = {
  primaryStyle: StyleOption;
  descendingBassWeight: number;
  complexity: number;
  dissonanceTolerance: number;
  cadenceStrength: number;
  preferSevenths: boolean;
  preferSuspensions: boolean;
  mood: string[];
  summary: string;
};

export const DEFAULT_INTERPRETED_STYLE: InterpretedStyle = {
  primaryStyle: "simple",
  descendingBassWeight: 0,
  complexity: 0.25,
  dissonanceTolerance: 0.2,
  cadenceStrength: 0.7,
  preferSevenths: false,
  preferSuspensions: false,
  mood: [],
  summary: "Use a clear, consonant progression with a strong resolution.",
};
```

Adjust `"simple"` and all style names to exactly match the existing `StyleOption` union.

Do not weaken existing type safety with broad `string` types unless unavoidable.

---

# Phase 3: Add Generation Preferences to the Music Engine

In `src/music/types.ts`, add a type equivalent to:

```ts
export type GenerationPreferences = {
  style: StyleOption;
  descendingBassWeight: number;
  complexity: number;
  dissonanceTolerance: number;
  cadenceStrength: number;
  preferSevenths: boolean;
  preferSuspensions: boolean;
};
```

Create:

```text
src/ai/toGenerationPreferences.ts
```

Implement:

```ts
import type { InterpretedStyle } from "./types";
import type { GenerationPreferences } from "@/src/music/types";

export function toGenerationPreferences(
  interpretation: InterpretedStyle,
): GenerationPreferences {
  return {
    style: interpretation.primaryStyle,
    descendingBassWeight: interpretation.descendingBassWeight,
    complexity: interpretation.complexity,
    dissonanceTolerance: interpretation.dissonanceTolerance,
    cadenceStrength: interpretation.cadenceStrength,
    preferSevenths: interpretation.preferSevenths,
    preferSuspensions: interpretation.preferSuspensions,
  };
}
```

Update the existing chord-scoring and progression-scoring context types so the preferences can reach both:

- per-chord scoring
- bass-motion scoring
- cadence/path scoring

Keep a backward-compatible default path so existing dropdown-based generation still works.

---

# Phase 4: Build the Server-Side Style Interpretation Route

Create:

```text
app/api/interpret-style/route.ts
```

Use `groq-sdk`.

The route must:

1. Read a JSON body with a `prompt` string.
2. Trim the prompt.
3. Return defaults for an empty prompt.
4. Reject prompts longer than 500 characters.
5. Call Groq only on the server.
6. Request JSON output.
7. Parse and sanitize all returned values.
8. Return safe defaults when Groq fails.
9. Never leak the API key.
10. Log server-side errors without sending stack traces to the client.

Use:

```ts
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});
```

Use the configured Groq model from an environment variable when available:

```ts
const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";
```

The request should use approximately:

```ts
temperature: 0;
max_completion_tokens: 300;
response_format: {
  type: "json_object";
}
```

Require this JSON shape:

```json
{
  "primaryStyle": "one allowed existing style",
  "descendingBassWeight": 0.0,
  "complexity": 0.0,
  "dissonanceTolerance": 0.0,
  "cadenceStrength": 0.0,
  "preferSevenths": false,
  "preferSuspensions": false,
  "mood": [],
  "summary": ""
}
```

The system prompt must state:

- Return only JSON.
- Use only supported style names.
- Do not return chord names.
- Do not generate a progression.
- Map simple/pop/clean/basic language toward the simple style.
- Map jazz/lush/sophisticated/colorful language toward the jazzy style.
- Map blues/gritty/dominant-seventh language toward the bluesy style.
- Increase descending-bass weight for falling, walking-down, or descending bass requests.
- Lower dissonance tolerance for safe, smooth, or consonant requests.
- Raise dissonance tolerance for tense, surprising, or experimental requests.
- Raise cadence strength for resolved, satisfying, or strong-ending requests.

Implement sanitization helpers that:

- Restrict `primaryStyle` to the existing allowed style values.
- Clamp all numeric settings to `0–1`.
- Accept only booleans for boolean fields.
- Limit `mood` to at most five short strings.
- Limit `summary` to 240 characters.
- Substitute defaults for invalid or missing fields.

Return a usable `InterpretedStyle` object even if the Groq request fails. Include an optional warning field if useful, but do not break the expected response shape.

---

# Phase 5: Display Interpretation Before Changing Generation Logic

In `Staff.tsx`, first add the text-prompt UI and display the interpreted settings without modifying scoring.

Add state equivalent to:

```ts
const [stylePrompt, setStylePrompt] = useState("");
const [isGenerating, setIsGenerating] = useState(false);
const [aiInterpretation, setAiInterpretation] =
  useState<InterpretedStyle | null>(null);
const [aiError, setAiError] = useState<string | null>(null);
```

Add a text area near the current style controls:

```tsx
<label className="flex flex-col gap-2">
  <span className="text-sm font-medium">Describe the harmony you want</span>

  <textarea
    value={stylePrompt}
    onChange={(event) => setStylePrompt(event.target.value)}
    maxLength={500}
    rows={3}
    placeholder="Warm and jazzy with a descending bass and a satisfying ending"
    className="rounded-md border px-3 py-2"
  />
</label>
```

Match the existing visual style instead of forcing these exact classes if the component already uses a consistent control style.

Add a client helper that calls:

```text
POST /api/interpret-style
```

Display a compact interpretation summary such as:

```text
Interpreted as: Jazzy · low dissonance · strong cadence · descending bass
```

At the end of this phase, verify that:

- the prompt reaches the route
- the route returns valid settings
- the settings render correctly
- existing chord generation remains unchanged

---

# Phase 6: Connect Preferences to the Music Engine Incrementally

Do not change all scoring behavior at once.

## Step 6A: Connect `primaryStyle`

Use `interpretation.primaryStyle` as the engine style when a non-empty prompt was interpreted successfully.

When the prompt is empty or interpretation fails, use the existing dropdown's `chordStyle`.

Preserve the current style dropdown as a manual fallback.

## Step 6B: Connect `descendingBassWeight`

Use the existing voicing or progression logic that already evaluates bass motion.

Reward controlled downward motion when the weight is high.

Suggested behavior:

- Reward downward motion of approximately 1–5 semitones.
- Do not reward very large drops merely because they descend.
- Penalize upward motion only when the requested weight is meaningfully above zero.
- Add a human-readable reason when the reward materially affects the score.

Do not introduce a second unrelated voicing system.

## Step 6C: Connect `cadenceStrength`

Use the existing cadence/path scoring.

Scale bonuses for:

- V–I
- IV–I
- ending on tonic
- other cadences already recognized by the engine

Scale penalties for weak endings when cadence strength is high.

Do not hard-code major-only assumptions if the existing engine supports minor keys.

## Step 6D: Connect Complexity Preferences

Use the actual `ChordQuality` values already defined in the project.

Possible behavior:

- Reward sevenths when `preferSevenths` is true.
- Reward suspensions when `preferSuspensions` is true.
- Reward simple triads when complexity is low.
- Penalize unnecessarily complex chords for explicitly simple prompts.
- Keep style-specific scoring already present in the engine.

Add grounded reasons such as:

```text
Uses a seventh chord to add the requested harmonic color.
Keeps the harmony simple and direct.
Uses a suspension for gentle tension.
```

## Step 6E: Connect `dissonanceTolerance`

Scale the existing non-chord-tone or melody-clash penalty.

Use behavior equivalent to:

```ts
const penaltyMultiplier = 1 - 0.8 * preferences.dissonanceTolerance;
```

This means:

```text
0.0 → full penalty
0.5 → reduced penalty
1.0 → only 20% of the original penalty
```

Do not reduce the penalty to zero.

Do not invent a new dissonance system if the engine already has melody-fit calculations. Modify the existing penalty at its actual source.

---

# Phase 7: Update the Generation Flow in `Staff.tsx`

Refactor the existing `generateChords` function carefully.

Required flow:

```text
Read the current style prompt
        ↓
Use cached interpretation if the normalized prompt was seen before
        ↓
Otherwise call `/api/interpret-style`
        ↓
Fall back to the dropdown/default settings on failure
        ↓
Convert interpretation to `GenerationPreferences`
        ↓
Run existing key detection
        ↓
Run existing candidate construction
        ↓
Run existing progression search with preferences
        ↓
Run existing voicing logic
        ↓
Store rendered chords and complete generation metadata
```

Add a loading state to the existing Generate button.

Do not make the user lose manually entered melody notes during generation.

Do not alter playback behavior.

---

# Phase 8: Add a Client-Side Interpretation Cache

In `Staff.tsx`, add:

```ts
const interpretationCacheRef = useRef<Map<string, InterpretedStyle>>(new Map());
```

Normalize keys with:

```ts
const normalizedPrompt = prompt.trim().toLowerCase();
```

When a prompt is already cached:

- reuse the existing `InterpretedStyle`
- do not call Groq again
- still allow the deterministic engine to choose a different top progression through its existing randomized top-window behavior

Do not cache failed or malformed responses unless they have been converted into an intentional stable fallback.

---

# Phase 9: Preserve a Full Generation Result

Do not rely only on `chordMeasures`, because that structure is primarily for rendering.

Add or reuse a result structure that preserves:

```ts
type GeneratedProgressionResult = {
  key: KeyContext;
  chords: ScoredChord[];
  interpretation: InterpretedStyle;
};
```

Use actual existing type names.

Store enough information for explanation:

- key name and mode
- chord symbol
- Roman numeral if available
- score
- deterministic reasons
- measure number
- interpreted style summary

Avoid duplicating large VexFlow or Tone.js objects.

---

# Phase 10: Build the Optional Explanation Route

Create:

```text
app/api/explain-progression/route.ts
```

This route must not independently analyze the music.

It should only rewrite facts produced by the deterministic engine.

Accept a body equivalent to:

```json
{
  "key": "C major",
  "styleRequest": "warm and jazzy with descending bass",
  "styleSummary": "Use gentle jazz harmony and a strong ending.",
  "progression": [
    {
      "measure": 1,
      "symbol": "Cmaj7",
      "romanNumeral": "Imaj7",
      "score": 18.5,
      "reasons": [
        "Contains the strongest melody tones E and G",
        "Establishes the tonic",
        "Matches the requested seventh-chord color"
      ]
    }
  ]
}
```

Validate and limit all input fields before sending them to Groq.

The Groq system prompt must say:

- Use only the supplied key, chord names, scores, style summary, and reasons.
- Do not change the progression.
- Do not invent melody notes.
- Do not invent chord functions.
- Do not invent voice-leading details.
- Do not claim a chord contains a melody note unless a supplied reason says so.
- Explain in accessible language.
- Return only JSON.

Return:

```json
{
  "overview": "Two or three concise sentences.",
  "measures": [
    {
      "measure": 1,
      "chord": "Cmaj7",
      "explanation": "One or two concise sentences."
    }
  ]
}
```

Use a low temperature, approximately `0.2–0.3`, and keep output under roughly 450 tokens.

---

# Phase 11: Add the Optional Explanation UI

Do not call the explanation route automatically after every generation.

In the existing “Why these chords?” area:

1. Continue showing deterministic engine reasons immediately.
2. Add an **Explain in plain English** button.
3. Disable the button when no progression exists.
4. Show a loading state while the request runs.
5. Display the overview and per-measure explanations when available.
6. Keep deterministic reasons visible even after the AI explanation appears.
7. Handle explanation failure without affecting the generated progression.

Add state equivalent to:

```ts
type AiProgressionExplanation = {
  overview: string;
  measures: Array<{
    measure: number;
    chord: string;
    explanation: string;
  }>;
};

const [aiExplanation, setAiExplanation] =
  useState<AiProgressionExplanation | null>(null);

const [isExplaining, setIsExplaining] = useState(false);
```

Clear stale explanations when a new progression is generated.

---

# Phase 12: Failure and Fallback Requirements

The application must continue to generate chords when:

- `GROQ_API_KEY` is missing
- the Groq model is unavailable
- the API returns an error
- rate limits are reached
- the user is offline
- the response is empty
- the response contains invalid JSON
- the returned settings are outside the allowed ranges

Fallback behavior:

```ts
{
  ...DEFAULT_INTERPRETED_STYLE,
  primaryStyle: chordStyle,
}
```

Show a small non-blocking message such as:

```text
AI interpretation was unavailable. The selected dropdown style was used instead.
```

Do not throw an uncaught client error.

Do not prevent playback or manual chord generation.

---

# Phase 13: Security Requirements

1. Never place `GROQ_API_KEY` in `Staff.tsx`.
2. Never use a variable named `NEXT_PUBLIC_GROQ_API_KEY`.
3. Never return the API key from an API route.
4. Never log the API key.
5. Keep all Groq calls inside `app/api/**/route.ts`.
6. Validate and truncate all client-provided strings.
7. Do not send unnecessary application state to Groq.
8. Do not send VexFlow objects, Tone.js objects, refs, or browser internals.
9. Confirm `.env.local` is ignored by Git.
10. Do not commit `.env.local`.

---

# Phase 14: Testing Requirements

## Interpretation Tests

Test:

```text
Keep it simple and consonant.
```

Expected:

- simple style
- low complexity
- low dissonance tolerance
- no strong seventh preference

Test:

```text
Make it lush, jazzy, and colorful.
```

Expected:

- jazzy style
- higher complexity
- seventh preference likely true

Test:

```text
Give it a smooth descending bass and a strong final resolution.
```

Expected:

- high descending-bass weight
- high cadence strength

Test:

```text
Make it tense and experimental, but still end clearly.
```

Expected:

- higher dissonance tolerance
- high cadence strength

## Failure Tests

Test:

- empty prompt
- prompt over 500 characters
- missing API key
- invalid model name
- repeated generation with the same prompt
- existing dropdown-only generation
- explanation request without a progression
- explanation request after generating a new progression
- malformed Groq JSON
- server error or rate limit

## Regression Tests

Confirm that:

- note placement still works
- VexFlow rendering still works
- key-signature accidentals still work
- automatic key detection still works
- existing style dropdowns still work
- repeated Generate still gives variety
- Tone.js playback still works
- Clear still works
- no API key appears in browser source or network responses

---

# Phase 15: Validation Before Completion

Run:

```bat
npm run lint
npm run build
```

Also run the development server and manually test the full flow.

Fix all new TypeScript errors introduced by this feature.

Do not suppress new lint warnings without a specific reason.

Do not broadly disable type checking.

Do not modify unrelated files.

---

# Completion Criteria

The work is complete when:

1. The user can enter a natural-language harmony request.
2. The request is interpreted through a server-side Groq route.
3. The interpretation is validated and displayed.
4. The interpretation influences the existing deterministic chord-scoring engine.
5. Existing dropdown-only behavior still works.
6. Repeated generation with the same prompt does not repeatedly call Groq.
7. Chord generation works without Groq.
8. Engine reasons remain visible.
9. AI explanation is optional and grounded only in engine output.
10. The API key is never exposed to the browser.
11. `npm run lint` and `npm run build` pass.
