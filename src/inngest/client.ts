import { Inngest } from "inngest";

/**
 * Single Inngest client for the app. Background workflows (lead discovery
 * today; enrichment/outreach sequencing in later phases — architecture doc
 * §2) are registered against this client and run via src/app/api/inngest.
 */
export const inngest = new Inngest({ id: "hartwich-os" });
