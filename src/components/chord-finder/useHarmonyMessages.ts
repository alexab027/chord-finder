import { useRef, useState } from "react";
import type { ScoredChord } from "../../music/types";
import { buildProgressionIdentityItems } from "../../music/progressionPresentation";
import type { ChatMessage } from "./HarmonyChat";

function formatKeyForHeading(keyLabel: string) {
  return keyLabel.replace(/\s+major$/i, "");
}

export function useHarmonyMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messageIdRef = useRef(0);

  function nextMessageId() {
    messageIdRef.current += 1;
    return `msg-${messageIdRef.current}`;
  }

  function pushMessage(message: ChatMessage) {
    setMessages((previous) => [...previous, message]);
  }

  function pushUserMessage(text: string) {
    pushMessage({
      id: nextMessageId(),
      kind: "text",
      role: "user",
      text,
    });
  }

  function pushAssistantMessage(text: string) {
    pushMessage({
      id: nextMessageId(),
      kind: "text",
      role: "assistant",
      text,
    });
  }

  function pushProgressionCard(
    label: "Generated" | "Updated",
    keyLabel: string,
    progression: ScoredChord[],
  ) {
    pushMessage({
      id: nextMessageId(),
      kind: "progression",
      heading: `${label} in ${formatKeyForHeading(keyLabel)}`,
      items: buildProgressionIdentityItems(progression),
    });
  }
  function pushExplanationMessage(
    overview: string,
    measures: Array<{
      measure: number;
      chord: string;
      explanation: string;
    }>,
  ) {
    pushMessage({
      id: nextMessageId(),
      kind: "explanation",
      overview,
      measures,
    });
  }

  return {
    messages,
    pushUserMessage,
    pushAssistantMessage,
    pushProgressionCard,
    pushExplanationMessage,
  };
}
