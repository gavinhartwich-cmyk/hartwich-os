import "server-only";
import Groq from "groq-sdk";

// Unlike Anthropic's SDK, groq-sdk throws at construction time if apiKey is
// `undefined` (vs. just failing the call later) — `?? ""` keeps module
// evaluation (and the build) safe when GROQ_API_KEY isn't set yet; actual
// calls still fail cleanly with a 401, same as before.
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });

/**
 * Groq client for interactive, human-facing calls (the Sales Manager chat).
 *
 * Groq's free tier caps tokens *per day per organization* (200k), and the
 * autonomous discovery agents share that pool — on 2026-09-10 they used
 * 198,528 of it by mid-afternoon, which left the chat unable to answer at
 * all. Batch work starving the one interactive feature is the wrong
 * tradeoff, and throttling discovery to protect the chat would cost real
 * lead volume.
 *
 * So: if GROQ_API_KEY_CHAT is set (a second free Groq account = its own
 * separate 200k/day allowance), the chat uses it and the agents can no
 * longer starve it. Unset, this falls back to the shared key and behaves
 * exactly as before — nothing breaks by not configuring it.
 */
export const groqInteractive = new Groq({
  apiKey: process.env.GROQ_API_KEY_CHAT || process.env.GROQ_API_KEY || "",
});

/** Whether the chat has a dedicated token pool rather than sharing the agents'. */
export const hasDedicatedChatKey = Boolean(process.env.GROQ_API_KEY_CHAT);
