import "server-only";
import Groq from "groq-sdk";

// Unlike Anthropic's SDK, groq-sdk throws at construction time if apiKey is
// `undefined` (vs. just failing the call later) — `?? ""` keeps module
// evaluation (and the build) safe when GROQ_API_KEY isn't set yet; actual
// calls still fail cleanly with a 401, same as before.
export const groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? "" });
