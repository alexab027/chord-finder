import Ajv, { type AnySchema } from "ajv";
import { describe, expect, it } from "vitest";
import {
  GROQ_HARMONY_ROUTER_SCHEMA,
  type GroqHarmonyRouterOutput,
} from "./harmonyRouterSchema";

const validate = new Ajv({ allErrors: true }).compile(
  GROQ_HARMONY_ROUTER_SCHEMA as unknown as AnySchema,
);

const baseOutput: GroqHarmonyRouterOutput = {
  intent: "generate_new",
  confidence: 0.95,
  primaryStyle: "simple",
  melodyFitPriority: 1,
  consonancePriority: 0.9,
  descendingBassWeight: 0,
  complexity: 0,
  dissonanceTolerance: 0,
  cadenceStrength: 0,
  preferSevenths: false,
  preferSuspensions: false,
  voiceLeadingPriority: 0.75,
  playabilityRequired: true,
  mood: [],
  summary: "Use a clear progression.",
  revision: null,
  actions: [],
  clarificationQuestion: null,
  assistantMessage: null,
};

function cloneOutput(): Record<string, unknown> {
  return structuredClone(baseOutput) as unknown as Record<string, unknown>;
}

function expectValid(value: unknown) {
  expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
}

function expectInvalid(value: unknown) {
  expect(validate(value)).toBe(false);
}

function expectEveryObjectSchemaClosed(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(expectEveryObjectSchemaClosed);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  const schema = value as Record<string, unknown>;
  if (schema.type === "object") {
    const properties = schema.properties as Record<string, unknown> | undefined;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(Object.keys(properties ?? {}));
  }

  Object.values(schema).forEach(expectEveryObjectSchemaClosed);
}

describe("Groq harmony router strict schema", () => {
  it("closes every object and requires every declared property", () => {
    expectEveryObjectSchemaClosed(GROQ_HARMONY_ROUTER_SCHEMA);
  });

  it.each([
    {
      intent: "generate_new",
      revision: null,
      clarificationQuestion: null,
      assistantMessage: null,
    },
    {
      intent: "revise_existing",
      revision: {
        preserveOverallProgression: true,
        preserveChordPositions: [1, 4],
        changeAmount: 0.5,
        requestedChanges: {
          complexityDelta: -0.5,
          dissonanceDelta: null,
          descendingBassDelta: null,
          cadenceDelta: 0.25,
        },
      },
      clarificationQuestion: null,
      assistantMessage: null,
    },
    {
      intent: "clarify",
      revision: null,
      clarificationQuestion: "Which measure should change?",
      assistantMessage: null,
    },
    {
      intent: "answer_question",
      revision: null,
      clarificationQuestion: null,
      assistantMessage: "The final chord functions as the dominant.",
    },
  ] as const)("accepts the $intent output shape", (intentFields) => {
    expectValid({ ...baseOutput, ...intentFields });
  });

  it.each(["simple", "jazzy"] as const)(
    "accepts the %s primary style",
    (primaryStyle) => {
      expectValid({ ...baseOutput, primaryStyle });
    },
  );

  it("accepts descending bass as a weight, not a primary style", () => {
    expectValid({ ...baseOutput, descendingBassWeight: 1 });
    expectInvalid({ ...baseOutput, primaryStyle: "descendingBass" });
    expectInvalid({ ...baseOutput, primaryStyle: "bluesy" });
  });

  it.each([
    { type: "copy_chord", fromMeasure: 1, toMeasure: 4 },
    {
      type: "set_chord",
      measure: 2,
      degree: 5,
      quality: "dominant",
      extension: null,
    },
    {
      type: "set_chord",
      measure: 2,
      degree: 5,
      quality: "dominant",
      extension: 7,
    },
    { type: "replace_chord", measure: 3, chordName: "Dm7" },
  ])("accepts a supported action: $type", (action) => {
    expectValid({ ...baseOutput, actions: [action] });
  });

  it("requires nullable revision deltas and set-chord extension fields", () => {
    const revision = {
      preserveOverallProgression: true,
      preserveChordPositions: [],
      changeAmount: 0.3,
      requestedChanges: {
        complexityDelta: null,
        dissonanceDelta: null,
        descendingBassDelta: null,
        cadenceDelta: null,
      },
    };
    expectValid({ ...baseOutput, intent: "revise_existing", revision });

    const missingDelta = structuredClone(revision);
    delete (
      missingDelta.requestedChanges as Partial<
        typeof missingDelta.requestedChanges
      >
    ).cadenceDelta;
    expectInvalid({
      ...baseOutput,
      intent: "revise_existing",
      revision: missingDelta,
    });

    expectInvalid({
      ...baseOutput,
      actions: [
        {
          type: "set_chord",
          measure: 2,
          degree: 5,
          quality: "dominant",
        },
      ],
    });
  });

  it("rejects missing and extra root fields", () => {
    const missing = cloneOutput();
    delete missing.actions;
    expectInvalid(missing);

    expectInvalid({ ...baseOutput, unexpected: true });
  });

  it.each([
    ["confidence above one", { confidence: 1.1 }],
    ["negative harmony weight", { consonancePriority: -0.1 }],
    [
      "revision delta above one",
      {
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: 1.1,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
      },
    ],
    [
      "revision delta below negative one",
      {
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: -1.1,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
      },
    ],
    [
      "degree above seven",
      {
        actions: [
          {
            type: "set_chord",
            measure: 2,
            degree: 8,
            quality: "major",
            extension: null,
          },
        ],
      },
    ],
    [
      "degree below one",
      {
        actions: [
          {
            type: "set_chord",
            measure: 2,
            degree: 0,
            quality: "major",
            extension: null,
          },
        ],
      },
    ],
    [
      "action measure above four",
      {
        actions: [
          {
            type: "replace_chord",
            measure: 5,
            chordName: "C",
          },
        ],
      },
    ],
    [
      "action measure below one",
      {
        actions: [
          {
            type: "replace_chord",
            measure: 0,
            chordName: "C",
          },
        ],
      },
    ],
    [
      "preserved measure above four",
      {
        intent: "revise_existing",
        revision: {
          preserveOverallProgression: true,
          preserveChordPositions: [5],
          changeAmount: 0.3,
          requestedChanges: {
            complexityDelta: null,
            dissonanceDelta: null,
            descendingBassDelta: null,
            cadenceDelta: null,
          },
        },
      },
    ],
  ])("rejects $0", (_label, patch) => {
    expectInvalid({ ...baseOutput, ...patch });
  });

  it("rejects unsupported or malformed action variants", () => {
    expectInvalid({
      ...baseOutput,
      actions: [{ type: "transpose_progression", amount: 2 }],
    });
    expectInvalid({
      ...baseOutput,
      actions: [
        {
          type: "copy_chord",
          fromMeasure: 1,
          toMeasure: 4,
          chordName: "C",
        },
      ],
    });
  });
});
