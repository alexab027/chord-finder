import type { HarmonyIntent, InterpretedStyle } from "./types";
import type { HarmonyChordQuality } from "../harmony/actions";

export type GroqRequestedChangesOutput = {
  complexityDelta: number | null;
  dissonanceDelta: number | null;
  descendingBassDelta: number | null;
  cadenceDelta: number | null;
};

export type GroqRevisionOutput = {
  preserveOverallProgression: boolean;
  preserveChordPositions: number[];
  changeAmount: number;
  requestedChanges: GroqRequestedChangesOutput;
};

export type GroqChordEditActionOutput =
  | {
      type: "copy_chord";
      fromMeasure: number;
      toMeasure: number;
    }
  | {
      type: "set_chord";
      measure: number;
      degree: number;
      quality: HarmonyChordQuality;
      extension: 7 | null;
    }
  | {
      type: "replace_chord";
      measure: number;
      chordName: string;
    };

// This is the model boundary. Nullable fields satisfy Groq strict mode without
// weakening the existing application/domain types, which continue to omit
// fields that do not apply to the selected intent.
export type GroqHarmonyRouterOutput = InterpretedStyle & {
  intent: HarmonyIntent;
  confidence: number;
  revision: GroqRevisionOutput | null;
  actions: GroqChordEditActionOutput[];
  clarificationQuestion: string | null;
  assistantMessage: string | null;
};

export const GROQ_HARMONY_ROUTER_SCHEMA_NAME = "harmony_router_response_v1";

export const GROQ_HARMONY_ROUTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: ["generate_new", "revise_existing", "clarify", "answer_question"],
    },
    confidence: { $ref: "#/$defs/unitNumber" },
    primaryStyle: {
      type: "string",
      enum: ["simple", "jazzy"],
    },
    melodyFitPriority: { $ref: "#/$defs/unitNumber" },
    consonancePriority: { $ref: "#/$defs/unitNumber" },
    descendingBassWeight: { $ref: "#/$defs/unitNumber" },
    complexity: { $ref: "#/$defs/unitNumber" },
    dissonanceTolerance: { $ref: "#/$defs/unitNumber" },
    cadenceStrength: { $ref: "#/$defs/unitNumber" },
    preferSevenths: { type: "boolean" },
    preferSuspensions: { type: "boolean" },
    voiceLeadingPriority: { $ref: "#/$defs/unitNumber" },
    playabilityRequired: { type: "boolean" },
    mood: {
      type: "array",
      items: { type: "string" },
    },
    summary: { type: "string" },
    revision: { $ref: "#/$defs/revision" },
    actions: {
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/$defs/copyChordAction" },
          { $ref: "#/$defs/setChordAction" },
          { $ref: "#/$defs/replaceChordAction" },
        ],
      },
    },
    clarificationQuestion: {
      type: ["string", "null"],
    },
    assistantMessage: {
      type: ["string", "null"],
    },
  },
  required: [
    "intent",
    "confidence",
    "primaryStyle",
    "melodyFitPriority",
    "consonancePriority",
    "descendingBassWeight",
    "complexity",
    "dissonanceTolerance",
    "cadenceStrength",
    "preferSevenths",
    "preferSuspensions",
    "voiceLeadingPriority",
    "playabilityRequired",
    "mood",
    "summary",
    "revision",
    "actions",
    "clarificationQuestion",
    "assistantMessage",
  ],
  $defs: {
    unitNumber: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    delta: {
      type: "number",
      minimum: -1,
      maximum: 1,
    },
    nullableDelta: {
      type: ["number", "null"],
      minimum: -1,
      maximum: 1,
    },
    revision: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        preserveOverallProgression: { type: "boolean" },
        preserveChordPositions: {
          type: "array",
          items: {
            type: "integer",
            minimum: 1,
            maximum: 4,
          },
        },
        changeAmount: { $ref: "#/$defs/unitNumber" },
        requestedChanges: {
          type: "object",
          additionalProperties: false,
          properties: {
            complexityDelta: { $ref: "#/$defs/nullableDelta" },
            dissonanceDelta: { $ref: "#/$defs/nullableDelta" },
            descendingBassDelta: { $ref: "#/$defs/nullableDelta" },
            cadenceDelta: { $ref: "#/$defs/nullableDelta" },
          },
          required: [
            "complexityDelta",
            "dissonanceDelta",
            "descendingBassDelta",
            "cadenceDelta",
          ],
        },
      },
      required: [
        "preserveOverallProgression",
        "preserveChordPositions",
        "changeAmount",
        "requestedChanges",
      ],
    },
    copyChordAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["copy_chord"],
        },
        fromMeasure: {
          type: "integer",
          minimum: 1,
          maximum: 4,
        },
        toMeasure: {
          type: "integer",
          minimum: 1,
          maximum: 4,
        },
      },
      required: ["type", "fromMeasure", "toMeasure"],
    },
    setChordAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["set_chord"],
        },
        measure: {
          type: "integer",
          minimum: 1,
          maximum: 4,
        },
        degree: {
          type: "integer",
          minimum: 1,
          maximum: 7,
        },
        quality: {
          type: "string",
          enum: ["major", "minor", "dominant", "diminished"],
        },
        extension: {
          type: ["integer", "null"],
          enum: [7, null],
        },
      },
      required: ["type", "measure", "degree", "quality", "extension"],
    },
    replaceChordAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["replace_chord"],
        },
        measure: {
          type: "integer",
          minimum: 1,
          maximum: 4,
        },
        chordName: { type: "string" },
      },
      required: ["type", "measure", "chordName"],
    },
  },
} as const;
