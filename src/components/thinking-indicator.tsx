"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

// Thinking phases - each phase has messages that cycle while in that phase.
// Phases change based on elapsed time + context (writing vs thinking).
interface ThinkingMessage {
  text: string;
  minElapsed?: number;
}

const THINKING_MESSAGES: ThinkingMessage[] = [
  // 0-4s: initial
  { text: "Reading your message", minElapsed: 0 },
  { text: "Understanding the request", minElapsed: 0 },
  { text: "Analyzing the skill", minElapsed: 0 },

  // 4-10s: processing
  { text: "Thinking about the best approach", minElapsed: 4 },
  { text: "Considering the skill structure", minElapsed: 4 },
  { text: "Reviewing context", minElapsed: 4 },
  { text: "Checking best practices", minElapsed: 4 },

  // 10-20s: deeper work
  { text: "Working through the details", minElapsed: 10 },
  { text: "Drafting the response", minElapsed: 10 },
  { text: "Making sure everything fits together", minElapsed: 10 },
  { text: "Refining the approach", minElapsed: 10 },

  // 20s+: complex / long-running
  { text: "Still thinking - this one is tricky", minElapsed: 20 },
  { text: "Almost there", minElapsed: 20 },
  { text: "Finalizing", minElapsed: 20 },
];

const WRITING_MESSAGES: ThinkingMessage[] = [
  { text: "Writing response" },
  { text: "Generating output" },
  { text: "Putting it together" },
];

export function ThinkingIndicator({
  elapsed,
  isWriting,
  onStop,
}: {
  elapsed: number;
  isWriting: boolean;
  onStop?: () => void;
}) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // Cycle through messages every 2.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setMsgIndex((i) => i + 1);
        setVisible(true);
      }, 300); // fade out duration
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Pick message based on current state
  const messages = isWriting ? WRITING_MESSAGES : THINKING_MESSAGES;
  const availableMessages = messages.filter((m) => (m.minElapsed ?? 0) <= elapsed);
  const currentMessage = availableMessages[msgIndex % availableMessages.length] || messages[0];

  return (
    <div className="flex gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
        <Sparkles className="size-3 animate-spin" />
      </div>
      <div className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-2 min-w-[200px]">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            <span className="size-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "0ms" }} />
            <span className="size-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "150ms" }} />
            <span className="size-1 rounded-full bg-primary animate-pulse" style={{ animationDelay: "300ms" }} />
          </div>
          <span
            className="text-xs text-muted-foreground transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {currentMessage.text}...
          </span>
          {elapsed > 3 && (
            <span className="text-[10px] font-mono text-muted-foreground/50">{elapsed}s</span>
          )}
          {onStop && (
            <button
              onClick={onStop}
              className="ml-auto text-[10px] text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded hover:bg-destructive/10"
              title="Stop AI"
            >
              Stop
            </button>
          )}
        </div>
        {elapsed > 30 && (
          <p className="text-[10px] text-amber-500">Taking longer than usual. Try Haiku model for faster responses.</p>
        )}
      </div>
    </div>
  );
}
