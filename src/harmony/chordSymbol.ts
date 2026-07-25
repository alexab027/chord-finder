// Single source of truth for the chord-name vocabulary that every gate and
// validator recognises: a root, an optional accidental, an optional quality,
// and an optional 7.
//
// The QUALITY LIST below is the part that actually changes when a new chord type
// is supported (adding "sus" earlier; a future "9", etc.). Keeping it here means
// one edit updates the client shortcut gate, the server-route validators, and
// the engine's name parser together, so the vocabulary cannot drift between them.
//
// Consumers keep their OWN RegExp wrappers and flags — some are anchored and
// case-insensitive, the engine parser is case-sensitive with capture groups —
// because only the vocabulary is shared here, not the matching semantics.
export const CHORD_QUALITIES = "sus2|sus4|sus|maj|min|m|dim|o|°|dom";

// Root + optional accidental + optional quality + optional 7, as a non-capturing
// fragment for embedding inside larger regexes.
export const CHORD_SYMBOL = `[A-Ga-g][#b]?(?:${CHORD_QUALITIES})?7?`;
