export function asksForExplicitDescendingBass(prompt: string) {
  const descending = /\bdescending\s+bass(?:\s*line|line)?\b/i;
  if (!descending.test(prompt)) return false;

  return !/(?:\bno\b|\bnot\b|\bwithout\b|\bavoid\b|\bdon't\b|\bdo not\b|\bless\b)[^.!?]{0,40}\bdescending\s+bass/i.test(
    prompt,
  );
}

export function getRelativeStyleChange(prompt: string) {
  if (/\bsimpler\b/i.test(prompt)) return "simpler" as const;
  if (/\bjazzier\b/i.test(prompt)) return "jazzier" as const;
  return undefined;
}
