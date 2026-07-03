# New refactoring of app: AI chat interface with groq routing generate new, clarify, answer, or edit existing requests

# Harmony Chat Architecture Plan

## Goal

Refactor the chord-finder assistant so that a user can interact with it as a back-and-forth chat interface.

The assistant should be able to:

- Generate a brand-new chord progression from a natural-language request
- Revise the currently displayed progression
- Ask a clarification question when the request is ambiguous
- Answer simple questions about the current progression
- Preserve conversation context so follow-up phrases such as “transpose it up two” or “make the second chord minor” work correctly
- Keep Groq responsible for understanding language, while deterministic TypeScript code remains responsible for musical changes

The central design principle is:

```text
Groq interprets the request.
The application decides what process to run.
Deterministic code performs the musical operation.
```

---

## Current Architecture

The current flow is approximately:

```text
User enters a style or command
        ↓
Staff.tsx sends the request to Groq
        ↓
Groq returns structured style information and/or revision actions
        ↓
The app generates or edits a ScoredChord[]
        ↓
voiceProgression(...) runs
        ↓
The chords are rendered and explained
```

The current architecture already supports parts of this system:

- Natural-language style interpretation
- New progression generation
- Deterministic chord revision actions
- `ScoredChord[]` as the editable source of truth
- One final call to `voiceProgression(...)`
- A stored previous progression
- Groq-generated explanations grounded in the final progression

The next step is to make the intent-routing behavior explicit.

---

# Proposed Architecture

## High-Level Flow

```text
User message
    ↓
Harmony intent router
    ↓
One of four results:
    1. generate_new
    2. revise_existing
    3. clarify
    4. answer_question
    ↓
The matching application process runs
```

The request router should decide what the user is trying to do before any progression-generation or chord-editing logic runs.

---

# Intent Types

Create a shared intent type for the Groq response.

```ts
type HarmonyIntent =
  | "generate_new"
  | "revise_existing"
  | "clarify"
  | "answer_question";
```

A more complete router response could be:

```ts
type HarmonyRouterResponse = {
  intent: HarmonyIntent;
  confidence: number;

  generationPreferences?: GenerationPreferences;
  actions?: HarmonyAction[];

  clarificationQuestion?: string;
  assistantMessage?: string;
};
```

Only the fields relevant to the selected intent should be present.

---

# Intent 1: Generate a New Progression

## Example Requests

```text
Make me a jazzy chord progression.
```

```text
Give me a blues progression.
```

```text
Generate something melancholic with sevenths.
```

```text
Start over and make it more dramatic.
```

## Expected Router Response

```ts
{
  intent: "generate_new",
  confidence: 0.96,
  generationPreferences: {
    primaryStyle: "jazzy",
    preferSevenths: true
  }
}
```

## Application Behavior

When the router returns `generate_new`:

1. Ignore the existing progression as the revision base.
2. Use the melody, key, and generation preferences.
3. Run the normal progression-generation engine.
4. Produce a new `ScoredChord[]`.
5. Store the result as the current progression.
6. Run `voiceProgression(...)` exactly once.
7. Render the new chords.
8. Add an assistant message describing what was generated.

## Important Rule

A request for a different musical style should usually generate a new progression rather than edit the previous chord identities.

Example:

```text
User: Make me a jazzy progression.
User: Now make me a blues progression.
```

The second request should run the generation pipeline again.

---

# Intent 2: Revise the Existing Progression

## Example Requests

```text
Transpose it up two semitones.
```

```text
Make the second chord minor.
```

```text
Copy chord one to chord four.
```

```text
Replace the last chord with G7.
```

```text
Move the voicings higher.
```

## Expected Router Response

```ts
{
  intent: "revise_existing",
  confidence: 0.94,
  actions: [
    {
      type: "transpose_progression",
      semitones: 2
    }
  ]
}
```

## Application Behavior

When the router returns `revise_existing`:

1. Confirm that a current progression exists.
2. Start from the stored `ScoredChord[]`.
3. Apply each deterministic action in order.
4. Produce one final `ScoredChord[]`.
5. Run `voiceProgression(...)` exactly once.
6. Save the final progression.
7. Render the revised result.
8. Add an assistant message describing the change.

## Required Guard

```ts
if (result.intent === "revise_existing" && currentProgression.length === 0) {
  addAssistantMessage(
    "There is no existing progression to edit. Would you like me to generate one first?",
  );
  return;
}
```

---

# Intent 3: Clarify

The model should not be forced to guess when a request has multiple reasonable musical meanings.

## Example Ambiguous Request

```text
Transpose up two.
```

Possible interpretations:

- Transpose the current chord progression up two semitones
- Transpose one selected chord
- Move the voicing two octaves higher
- Move the rendered notes higher on the staff
- Generate a new progression in a higher key
- Transpose the melody and progression together

## Expected Router Response

```ts
{
  intent: "clarify",
  confidence: 0.45,
  clarificationQuestion:
    "Do you want me to transpose the existing chord progression up two semitones, move its voicing higher on the staff, or generate a new progression in a higher key?"
}
```

## Application Behavior

When the router returns `clarify`:

1. Do not change the progression.
2. Display the clarification question as an assistant message.
3. Save the unresolved request in `pendingClarification`.
4. Send that context with the next user message.
5. Let Groq resolve the follow-up into a concrete intent and action.

---

# Pending Clarification State

Add state for unresolved requests.

```ts
type PendingClarification = {
  originalMessage: string;
  question: string;
  possibleIntents?: string[];
};
```

Example:

```ts
setPendingClarification({
  originalMessage: "transpose up two",
  question:
    "Do you want to transpose the progression or move the voicing higher?",
  possibleIntents: ["transpose_progression", "shift_voicing", "generate_new"],
});
```

When the user replies:

```text
The existing progression up two semitones.
```

send:

```ts
{
  message: "The existing progression up two semitones.",
  pendingClarification: {
    originalMessage: "transpose up two",
    question:
      "Do you want to transpose the progression or move the voicing higher?"
  },
  currentProgression: ["Dm7", "G7", "Cmaj7", "Am7"]
}
```

After the clarification is successfully resolved:

```ts
setPendingClarification(null);
```

---

# Intent 4: Answer a Question

The chat should also be able to answer questions without changing the progression.

## Example Requests

```text
Why did you choose the second chord?
```

```text
What key is this in?
```

```text
Does this progression have a strong cadence?
```

```text
What notes are in the third chord?
```

## Expected Router Response

```ts
{
  intent: "answer_question",
  confidence: 0.92,
  assistantMessage:
    "The second chord functions as a predominant and creates smoother motion into the dominant."
}
```

## Application Behavior

When the router returns `answer_question`:

1. Do not modify the progression.
2. Add the returned answer to the chat.
3. Keep the current progression unchanged.

For grounded answers, send the current chord names, key, deterministic reasons, and relevant score information to Groq.

---

# Harmony Action Types

The revision system should distinguish chord identity from voicing.

## Proposed Action Union

```ts
type HarmonyAction =
  | {
      type: "copy_chord";
      sourceIndex: number;
      targetIndex: number;
    }
  | {
      type: "replace_chord";
      chordIndex: number;
      chordName: string;
    }
  | {
      type: "change_quality";
      chordIndex: number;
      quality: ChordQuality;
    }
  | {
      type: "transpose_chord";
      chordIndex: number;
      semitones: number;
    }
  | {
      type: "transpose_progression";
      semitones: number;
    }
  | {
      type: "shift_voicing";
      chordIndex?: number;
      octaves: number;
    };
```

---

# Chord Identity vs. Voicing

These must remain separate concepts.

## Transpose Chord Identity

```text
Cmaj7 → Dmaj7
Am7 → Bm7
```

This changes:

- Root pitch class
- Chord name
- Note names
- Pitch classes
- Potentially key relationship
- Any cached scoring metadata

Use:

```ts
{
  type: "transpose_progression",
  semitones: 2
}
```

## Shift Voicing

```text
C3 E3 G3 → C4 E4 G4
```

This preserves:

- Chord name
- Chord quality
- Pitch classes
- Harmonic function

It changes only the rendered register.

Use:

```ts
{
  type: "shift_voicing",
  octaves: 1
}
```

This distinction should be described clearly in the Groq system prompt.

---

# Groq Request Context

Groq should receive enough context to understand follow-up language without receiving unnecessary application state.

## Suggested Request Body

```ts
type HarmonyRouterRequest = {
  message: string;

  hasExistingProgression: boolean;
  currentProgression: string[];
  activeKey?: string;

  previousUserMessage?: string;
  previousAssistantAction?: HarmonyIntent;

  recentMessages?: ChatMessage[];
  pendingClarification?: PendingClarification | null;
};
```

## Minimum Useful Context

Send:

- Current user message
- Whether a progression exists
- Current chord names
- Current key
- Previous action type
- Last few chat messages
- Pending clarification, if one exists

Avoid sending:

- Full rendered VexFlow objects
- Large internal score structures
- Unnecessary UI state
- The entire conversation when only the last few turns are needed

---

# Chat Message State

Add a structured chat history.

```ts
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};
```

Example state:

```ts
const [messages, setMessages] = useState<ChatMessage[]>([]);
```

Helper:

```ts
function addMessage(role: ChatMessage["role"], content: string) {
  setMessages((previous) => [
    ...previous,
    {
      id: crypto.randomUUID(),
      role,
      content,
      timestamp: Date.now(),
    },
  ]);
}
```

The router normally only needs the most recent few messages:

```ts
const recentMessages = messages.slice(-6);
```

---

# Frontend Control Flow

The main submit handler should route before taking musical action.

```ts
async function handleHarmonyMessage(message: string) {
  addMessage("user", message);

  const result = await interpretHarmonyMessage({
    message,
    hasExistingProgression: currentProgression.length > 0,
    currentProgression: currentProgression.map(
      (scoredChord) => scoredChord.chord.name,
    ),
    activeKey,
    previousAssistantAction,
    recentMessages: messages.slice(-6),
    pendingClarification,
  });

  switch (result.intent) {
    case "generate_new":
      await handleGenerateNewProgression(result);
      break;

    case "revise_existing":
      handleReviseExistingProgression(result);
      break;

    case "clarify":
      handleClarification(result, message);
      break;

    case "answer_question":
      handleAnswerQuestion(result);
      break;
  }
}
```

---

# Generation Handler

```ts
async function handleGenerateNewProgression(result: HarmonyRouterResponse) {
  const preferences = result.generationPreferences ?? defaultPreferences;

  const generatedProgression = generateProgression({
    melody: measures,
    key: activeKey,
    preferences,
  });

  const chordMeasures = voiceProgression(
    generatedProgression,
    measures,
    getRenderedPitch,
    preferences,
  );

  lastProgressionRef.current = generatedProgression;
  setChordMeasures(chordMeasures);

  setPendingClarification(null);
  setPreviousAssistantAction("generate_new");

  addMessage("assistant", describeGeneratedProgression(generatedProgression));
}
```

---

# Revision Handler

```ts
function handleReviseExistingProgression(result: HarmonyRouterResponse) {
  const baseProgression = lastProgressionRef.current;

  if (!baseProgression.length) {
    addMessage(
      "assistant",
      "There is no existing progression to edit. Would you like me to generate one first?",
    );
    return;
  }

  let finalProgression = baseProgression;

  for (const action of result.actions ?? []) {
    finalProgression = applyHarmonyAction(finalProgression, action);
  }

  const chordMeasures = voiceProgression(
    finalProgression,
    measures,
    getRenderedPitch,
    effectiveStyle,
  );

  lastProgressionRef.current = finalProgression;
  setChordMeasures(chordMeasures);

  setPendingClarification(null);
  setPreviousAssistantAction("revise_existing");

  addMessage(
    "assistant",
    describeRevision(result.actions ?? [], finalProgression),
  );
}
```

---

# Clarification Handler

```ts
function handleClarification(
  result: HarmonyRouterResponse,
  originalMessage: string,
) {
  const question =
    result.clarificationQuestion ??
    "Could you clarify whether you want a new progression or a change to the current one?";

  setPendingClarification({
    originalMessage,
    question,
  });

  setPreviousAssistantAction("clarify");
  addMessage("assistant", question);
}
```

---

# Question Handler

```ts
function handleAnswerQuestion(result: HarmonyRouterResponse) {
  const answer =
    result.assistantMessage ??
    "I could not determine an answer from the current progression.";

  setPreviousAssistantAction("answer_question");
  addMessage("assistant", answer);
}
```

---

# Deterministic Action Execution

Keep all musical mutations outside the LLM.

```ts
function applyHarmonyAction(
  progression: ScoredChord[],
  action: HarmonyAction,
): ScoredChord[] {
  switch (action.type) {
    case "copy_chord":
      return copyChord(progression, action);

    case "replace_chord":
      return replaceChord(progression, action);

    case "change_quality":
      return changeChordQuality(progression, action);

    case "transpose_chord":
      return transposeChord(progression, action);

    case "transpose_progression":
      return transposeProgression(progression, action);

    case "shift_voicing":
      return applyVoicingShift(progression, action);

    default:
      return assertNever(action);
  }
}
```

---

# Transposition Helpers

## Pitch-Class Transposition

```ts
function transposePitchClass(pitchClass: number, semitones: number): number {
  return (((pitchClass + semitones) % 12) + 12) % 12;
}
```

## Progression Transposition

```ts
function transposeProgression(
  progression: ScoredChord[],
  action: {
    type: "transpose_progression";
    semitones: number;
  },
): ScoredChord[] {
  return progression.map((scoredChord) =>
    transposeScoredChord(scoredChord, action.semitones),
  );
}
```

## Metadata Handling

When a chord is changed, position-dependent or generation-dependent metadata should not be treated as valid.

Fields such as these may need to be reset:

```ts
score;
reasons;
bassMidi;
transitionScore;
melodyCompatibility;
```

The transposed chord should receive new independent arrays for fields such as:

```ts
pcs;
noteNames;
pitches;
```

Do not reuse array references from the original chord.

---

# Router Validation

The Groq response must be validated before execution.

Possible options:

- Zod schema
- Manual runtime validation
- Existing project validation utilities

## Example Rules

- `generate_new` must include generation preferences or a usable style prompt
- `revise_existing` must include at least one valid action
- `clarify` must include a non-empty question
- `answer_question` must include a non-empty assistant message
- Chord indices must be within the progression bounds
- Semitone values must be finite integers
- Voicing shifts should use octave values rather than semitone values
- Unknown action types must be rejected

---

# Confidence and Clarification Rules

The application should not depend only on Groq's confidence score, but the score can be used as one signal.

```ts
if (result.confidence < 0.7 && result.intent !== "clarify") {
  addMessage(
    "assistant",
    result.clarificationQuestion ??
      "Could you clarify whether you want a new progression or a revision to the current one?",
  );
  return;
}
```

The prompt should explicitly instruct Groq:

- Do not guess when multiple interpretations are musically reasonable
- Return `clarify` when the missing information affects the musical result
- Do not return a revision action unless the action can be executed deterministically
- Never invent unsupported action types

---

# Groq System Prompt Requirements

The router system prompt should explain:

## Role

You are a harmony request interpreter for a chord-generation application.

## Responsibilities

- Determine whether the user wants a new progression, a revision, clarification, or an answer
- Return only valid structured JSON
- Use the current progression and recent messages to resolve references such as “it,” “that,” and “the second chord”
- Ask for clarification when the request is ambiguous
- Distinguish harmonic transposition from voicing movement
- Never directly invent rendered chord pitches
- Never claim that a musical change was made
- Only return actions supported by the schema

## Important Distinctions

```text
"Make me a blues progression"
→ generate_new
```

```text
"Make this progression more bluesy"
→ revise_existing or clarify, depending on supported actions
```

```text
"Transpose it up two semitones"
→ revise_existing: transpose_progression
```

```text
"Move it higher on the staff"
→ revise_existing: shift_voicing
```

```text
"Transpose up two"
→ clarify
```

---

# Example Conversations

## Example 1: Generate, Then Revise

```text
User:
Make me a jazzy chord progression.

Router:
generate_new

Application:
Runs generation engine.

Assistant:
I generated a jazzy four-chord progression with extended harmony.
```

```text
User:
Transpose it up two semitones.

Router:
revise_existing
action: transpose_progression, semitones: 2

Application:
Transposes current ScoredChord[] and revoices once.

Assistant:
I transposed the existing progression up two semitones.
```

---

## Example 2: Generate Again

```text
User:
Make me a jazzy progression.

Router:
generate_new
```

```text
User:
Now make me a blues progression.

Router:
generate_new
```

The second request should not merely modify the previous chord names. It should run the generation engine again using blues preferences.

---

## Example 3: Clarification

```text
User:
Transpose up two.

Router:
clarify

Assistant:
Do you want me to transpose the existing progression up two semitones, move the voicing higher on the staff, or generate a new progression in a higher key?
```

```text
User:
The existing progression up two semitones.

Router:
revise_existing
action: transpose_progression, semitones: 2
```

---

## Example 4: No Existing Progression

```text
User:
Make the second chord minor.

Router:
revise_existing
```

Application guard:

```text
There is no existing progression to edit. Would you like me to generate one first?
```

---

## Example 5: Question Without Mutation

```text
User:
Why did you choose the final chord?

Router:
answer_question
```

The progression remains unchanged.

---

# Suggested File Organization

The exact names can match the existing project, but the responsibilities should be separated.

```text
src/
  app/
    api/
      interpret-harmony/
        route.ts

  lib/
    harmony/
      actions.ts
      actionTypes.ts
      applyHarmonyAction.ts
      transposeChord.ts
      transposeProgression.ts
      shiftVoicing.ts
      routerTypes.ts
      routerValidation.ts
      generation.ts
      explanation.ts

  components/
    Staff.tsx
    HarmonyChat.tsx
```

## Responsibilities

### `routerTypes.ts`

- `HarmonyIntent`
- `HarmonyRouterRequest`
- `HarmonyRouterResponse`
- `PendingClarification`
- `ChatMessage`

### `actionTypes.ts`

- `HarmonyAction`
- Individual action interfaces

### `routerValidation.ts`

- Runtime validation of Groq responses

### `applyHarmonyAction.ts`

- Deterministic action dispatch

### `transposeChord.ts`

- Single-chord harmonic transposition

### `transposeProgression.ts`

- Entire-progression harmonic transposition

### `shiftVoicing.ts`

- Register-only changes

### `HarmonyChat.tsx`

- Chat messages
- Input field
- Loading state
- Clarification display
- Conversation UI

### `Staff.tsx`

- Melody and key state
- Current `ScoredChord[]`
- Calls generation and revision processes
- Runs final voicing and updates rendering

---

# Implementation Order

## Phase 1: Introduce Intent Routing

1. Add the four intent types.
2. Update the Groq schema.
3. Update the Groq system prompt.
4. Return `generate_new`, `revise_existing`, `clarify`, or `answer_question`.
5. Log the router result during development.
6. Preserve the current generation and revision behavior.

### Stopping Point

The application correctly distinguishes:

- “Make me a jazzy progression”
- “Make the second chord minor”
- “Why did you choose this chord?”
- An intentionally ambiguous request

No new actions are required yet.

---

## Phase 2: Separate Generation and Revision Handlers

1. Extract `handleGenerateNewProgression`.
2. Extract `handleReviseExistingProgression`.
3. Add guards for missing current progression.
4. Ensure `voiceProgression(...)` runs once per completed operation.
5. Remove duplicated state updates.

### Stopping Point

New progression requests and existing progression edits take visibly separate code paths.

---

## Phase 3: Add Chat State

1. Add `ChatMessage`.
2. Store user and assistant turns.
3. Send the most recent messages to Groq.
4. Add `previousAssistantAction`.
5. Render the messages in a simple chat panel.

### Stopping Point

Follow-up references such as “it” and “the second chord” can use recent context.

---

## Phase 4: Add Clarification State

1. Add `PendingClarification`.
2. Store unresolved requests.
3. Include the pending clarification in the next Groq request.
4. Clear it after successful resolution.
5. Confirm that no progression changes occur during clarification.

### Stopping Point

The full interaction works:

```text
Transpose up two.
→ clarification
The progression up two semitones.
→ deterministic revision
```

---

## Phase 5: Implement Transposition

1. Add `transpose_chord`.
2. Add `transpose_progression`.
3. Update the action schema.
4. Update validation.
5. Implement pitch-class transposition.
6. Update note spelling.
7. Reset invalid metadata.
8. Revoice once after all actions.
9. Add manual tests for positive and negative semitone values.

### Stopping Point

These work:

```text
Transpose chord two up one semitone.
Transpose the whole progression up two semitones.
Transpose the progression down three semitones.
```

---

## Phase 6: Add Voicing Movement

1. Add `shift_voicing`.
2. Decide whether the action affects one chord or the entire progression.
3. Preserve chord identity.
4. Modify only register-related rendering data.
5. Add clarification behavior for vague wording such as “move it up.”

### Stopping Point

The assistant correctly distinguishes:

```text
Transpose the progression up an octave.
```

from:

```text
Move the same voicing one octave higher.
```

---

## Phase 7: Add Grounded Questions and Explanations

1. Route informational questions to `answer_question`.
2. Send current progression context.
3. Ground answers in chord names, key, scores, and deterministic reasons.
4. Ensure no action is executed for questions.
5. Keep answers concise in the chat interface.

---

# Testing Checklist

## Intent Routing

- [ ] “Make me a jazzy progression” returns `generate_new`
- [ ] “Make me a blues progression” returns `generate_new`
- [ ] “Replace chord two with Am” returns `revise_existing`
- [ ] “Copy chord one to chord four” returns `revise_existing`
- [ ] “Why is the third chord there?” returns `answer_question`
- [ ] “Transpose up two” returns `clarify`

## Existing Progression Guards

- [ ] Revision request with no progression does not crash
- [ ] Revision request with no progression produces a useful assistant message
- [ ] Generation works regardless of whether an old progression exists

## Clarification

- [ ] Clarification does not alter the current progression
- [ ] Pending clarification is included in the next request
- [ ] Follow-up response resolves into a valid action
- [ ] Pending clarification clears after resolution
- [ ] A new unrelated request can replace a pending clarification safely

## Transposition

- [ ] Positive semitone transposition works
- [ ] Negative semitone transposition works
- [ ] Pitch classes wrap correctly around 0–11
- [ ] Chord names update
- [ ] Note-name arrays update
- [ ] Deep copies are used
- [ ] Invalid score metadata is reset
- [ ] The progression is voiced only once after all edits

## Voicing

- [ ] Moving voicing higher does not change chord names
- [ ] Moving voicing lower does not change pitch classes
- [ ] One-chord and full-progression shifts are distinguishable
- [ ] Staff rendering remains within a reasonable range

## Conversation

- [ ] “it” refers to the current progression
- [ ] “the second chord” resolves to the correct index
- [ ] “now make me a blues progression” starts a new generation
- [ ] Questions do not mutate progression state
- [ ] Invalid Groq output is handled safely

---

# Recommended First Work Session

For the next development session, avoid implementing every feature at once.

Focus on this bounded milestone:

1. Add the four intent types.
2. Update the Groq response schema.
3. Update the prompt so Groq explicitly routes the message.
4. Split the frontend into generation, revision, clarification, and question branches.
5. Add a simple `pendingClarification` state.
6. Test the flow with existing supported actions.
7. Commit before adding transposition.

Suggested commit:

```bash
git add .
git commit -m "add harmony intent routing and clarification flow"
```

After that commit, implement transposition as a separate feature.

Suggested second commit:

```bash
git add .
git commit -m "add deterministic chord transposition actions"
```

---

# Definition of Done

This architecture is complete when the following conversation works reliably:

```text
User:
Make me a jazzy progression.

Assistant:
Generates a new progression.

User:
Transpose up two.

Assistant:
Asks whether the user means harmonic transposition or voicing movement.

User:
Transpose the existing progression up two semitones.

Assistant:
Revises the current progression deterministically.

User:
Why did you choose the third chord?

Assistant:
Answers without changing the progression.

User:
Now make me a blues progression.

Assistant:
Runs the new-generation process again.
```

At every stage:

- Groq interprets language
- TypeScript validates the result
- Deterministic code performs musical changes
- `ScoredChord[]` remains the progression source of truth
- `voiceProgression(...)` runs once after the final progression is known
- The chat history reflects what the application actually did
