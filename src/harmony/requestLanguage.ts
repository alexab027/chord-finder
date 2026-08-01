export function asksForExplicitDescendingBass(prompt: string) {
  const descending = /\bdescending\s+bass(?:\s*line|line)?\b/i;
  if (!descending.test(prompt)) return false;

  return !/(?:\bno\b|\bnot\b|\bwithout\b|\bavoid\b|\bdon't\b|\bdo not\b|\bless\b)[^.!?]{0,40}\bdescending\s+bass/i.test(
    prompt,
  );
}

export function getRelativeStyleChange(prompt: string) {
  const relativeStyles = [
    {
      direction: "simpler" as const,
      pattern: /\b(?:simpler|(?:(?:much|even|slightly|a\s+little)\s+)?more\s+simple)\b/gi,
    },
    {
      direction: "jazzier" as const,
      pattern: /\b(?:jazzier|(?:(?:much|even|slightly|a\s+little)\s+)?more\s+jazzy)\b/gi,
    },
  ];

  const matches = relativeStyles.flatMap(({ direction, pattern }) =>
    [...prompt.matchAll(pattern)].map((match) => ({
      direction,
      index: match.index,
      phrase: match[0],
    })),
  );

  const firstPositive = matches
    .filter(({ index, phrase }) => {
      const prefix = prompt.slice(Math.max(0, index - 60), index);
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return !new RegExp(
        `(?:\\bnot\\b|\\bnever\\b|\\bdon't\\b|\\bdo\\s+not\\b|\\bwithout\\b|\\bless\\b)[^.!?]{0,50}${escapedPhrase}$`,
        "i",
      ).test(`${prefix}${phrase}`);
    })
    .sort((left, right) => left.index - right.index)[0];

  if (firstPositive) return firstPositive.direction;
  return undefined;
}

export function getStyleAlternativeReply(prompt: string) {
  const normalized = prompt.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (
    /^(?:no|no thanks|never mind|nevermind|cancel|keep (?:it|this|the current progression))$/.test(
      normalized,
    )
  ) {
    return "decline" as const;
  }
  if (
    /^(?:yes|yes please|sure|show (?:me )?(?:something )?different(?: options)?(?: at the same (?:level|jazziness|simplicity))?|show (?:me )?alternatives|different options)$/.test(
      normalized,
    )
  ) {
    return "accept" as const;
  }
  return undefined;
}

export function isSupportedFocusedHarmonyQuestion(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  const hasQuestionCue =
    /^(?:why|what|how|explain|tell me|can you explain|could you explain)\b/.test(
      normalized,
    ) || normalized.endsWith("?");
  if (!hasQuestionCue) return false;

  const measure =
    "(?:\\d+|one|two|three|four|first|second|third|fourth)";
  const explicitMeasure = new RegExp(
    `\\b(?:measure|bar|chord)\\s*${measure}\\b`,
  );
  const focusedTransition = new RegExp(
    `\\b(?:measure|chord)s?\\s*${measure}\\s*(?:to|through|and|into|between)\\s*(?:measure|chord)?s?\\s*${measure}\\b`,
  );

  return (
    /\b(?:option|candidate)\b/.test(normalized) ||
    focusedTransition.test(normalized) ||
    explicitMeasure.test(normalized)
  );
}
