type HarmonyDebugDetails = Record<string, unknown>;

export type HarmonyDebugEntry = {
  timestamp: string;
  event: string;
  details: HarmonyDebugDetails;
};

declare global {
  interface Window {
    __harmonyDebugLog?: HarmonyDebugEntry[];
  }
}

function recordDebugEntry(event: string, details: HarmonyDebugDetails) {
  if (typeof window === "undefined") return;
  const nextEntry: HarmonyDebugEntry = {
    timestamp: new Date().toISOString(),
    event,
    details,
  };
  window.__harmonyDebugLog = [
    ...(window.__harmonyDebugLog ?? []),
    nextEntry,
  ].slice(-200);
}

export function harmonyDebug(
  event: string,
  details: HarmonyDebugDetails = {},
) {
  if (process.env.NODE_ENV !== "development") return;
  recordDebugEntry(event, details);
  console.info(`[harmony-debug] ${event}`, details);
}

export function harmonyDebugError(
  event: string,
  error: unknown,
  details: HarmonyDebugDetails = {},
) {
  if (process.env.NODE_ENV !== "development") return;
  const errorDetails = {
    ...details,
    errorType: error instanceof Error ? error.name : typeof error,
  };
  recordDebugEntry(event, errorDetails);
  console.error(`[harmony-debug] ${event}`, errorDetails);
}
