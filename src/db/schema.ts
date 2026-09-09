/**
 * Hartwich OS — database schema (Drizzle ORM / Postgres via Supabase)
 *
 * Mirrors the design in the "Hartwich OS — System Architecture" doc (§3).
 * Two structural decisions worth remembering while editing this file:
 *
 *  - `companies` is the durable lead record; `deals` is one trip of a
 *    company through the pipeline. A company can have multiple deals
 *    over time (e.g. re-engaged after Closed-Lost) without losing its
 *    research history.
 *  - Every table that a future feature might need to filter, score, or
 *    branch on carries an explicit column now (e.g. `role` on `users`,
 *    `contactTier` on `companies`) even though only one value is in use
 *    today — so extending behavior later is a data change, not a
 *    migration surprise.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["admin", "member"]);

export const companySourceEnum = pgEnum("company_source", [
  "google_places",
  "apollo",
  "manual",
]);

export const companyStatusEnum = pgEnum("company_status", [
  "needs_review", // AI-qualified below confidence threshold — awaiting a human look
  "qualified",
  "disqualified",
]);

export const contactTierEnum = pgEnum("contact_tier", ["A", "B", "C"]);

export const activityTypeEnum = pgEnum("activity_type", [
  "email",
  "sms",
  "call",
  "linkedin",
  "note",
  "meeting",
]);

export const activityDirectionEnum = pgEnum("activity_direction", [
  "outbound",
  "inbound",
]);

export const messageProviderEnum = pgEnum("message_provider", [
  "gmail",
  "twilio",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "draft",
  "sent",
  "delivered",
  "opened",
  "replied",
  "bounced",
  "failed",
]);

export const templateChannelEnum = pgEnum("template_channel", [
  "email",
  "sms",
  "linkedin",
]);

export const aiRunTargetTypeEnum = pgEnum("ai_run_target_type", [
  "company_qualification",
  "outreach_draft",
  "enrichment",
]);

export const aiRunStatusEnum = pgEnum("ai_run_status", [
  "pending",
  "succeeded",
  "failed",
]);

export const leadSourceTypeEnum = pgEnum("lead_source_type", [
  "google_places",
  "apollo",
  "manual",
]);

export const emailDraftStatusEnum = pgEnum("email_draft_status", [
  "pending_review",
  "approved",
  "rejected",
  "sent",
]);

// What triggered an email draft — drives what happens to the deal when it's
// sent (see sendApprovedDraft in src/lib/emails/send-approved-draft.ts) and
// which mailbox/threading rules apply (a reply must go out from the same
// account, in the same Gmail thread, as whatever it's replying to).
export const emailDraftKindEnum = pgEnum("email_draft_kind", [
  "cold_outreach", // first touch to a New Lead — sending it moves the deal to Contacted
  "follow_up", // automated 3/6/9-day nudge, no reply yet (v1.1 cadence)
  "bounce_correction", // re-send to a freshly-found address after the original bounced
  "reply", // AI-drafted response to an inbound reply — sent in-thread, same mailbox
]);

export const bookingQuestionTypeEnum = pgEnum("booking_question_type", [
  "text",
  "textarea",
  "email",
  "phone",
  "select",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "cancelled",
]);

export const discoveryRunStatusEnum = pgEnum("discovery_run_status", [
  "running",
  "completed", // hit the target count
  "completed_partial", // exhausted the radius cap short of target — never lowers the quality bar to compensate
  "failed",
]);

// ---------------------------------------------------------------------------
// users — the allow-listed admin accounts (see §4 of the architecture doc)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("admin"),
  googleSub: text("google_sub").unique(), // Google's stable subject id, from Supabase Auth
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// pipeline_stages — configurable Kanban columns (data, not code — see §6)
// ---------------------------------------------------------------------------

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  isWon: boolean("is_won").notNull().default(false),
  isLost: boolean("is_lost").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// companies — the durable lead record (§3, §5 ICP fields)
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  website: text("website"),
  phone: text("phone"),
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),

  source: companySourceEnum("source").notNull(),
  sourceRefId: text("source_ref_id"), // e.g. Google Places place_id

  // --- ICP / qualification signals (architecture doc §5) ---
  googleReviewCount: integer("google_review_count"),
  googleRating: numeric("google_rating", { precision: 3, scale: 2 }),
  reviewSignal: jsonb("review_signal").$type<{
    recentNegativeCount?: number;
    unansweredApprox?: boolean;
    sampleSnippets?: string[];
  }>(),
  isOwnerOperated: boolean("is_owner_operated"),
  isFranchise: boolean("is_franchise"),
  contactTier: contactTierEnum("contact_tier"),
  qualificationScore: integer("qualification_score"), // 0–100
  qualificationReasoning: text("qualification_reasoning"),

  // --- Website enrichment (Phase 2 "Enrich" step) — captured once at
  // discovery time so outreach drafting can reference real research
  // about the business instead of a generic template. Null for leads
  // discovered before this field existed, or with no website to read.
  websiteSummary: text("website_summary"),
  servicesOffered: jsonb("services_offered").$type<string[]>(),
  apparentSize: text("apparent_size"),
  disqualifyReason: text("disqualify_reason"),
  status: companyStatusEnum("status").notNull().default("needs_review"),

  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// contacts — a person at a company
// ---------------------------------------------------------------------------

export const contacts = pgTable("contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name"),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  linkedinUrl: text("linkedin_url"),
  isPrimary: boolean("is_primary").notNull().default(false),
  source: companySourceEnum("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// deals — one trip of a company through the pipeline
// ---------------------------------------------------------------------------

export const deals = pgTable("deals", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => pipelineStages.id),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  valueEstimate: numeric("value_estimate", { precision: 12, scale: 2 }),
  priority: integer("priority").notNull().default(0),
  expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
  stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).notNull().defaultNow(),

  // --- Email follow-up cadence (v1.1) ---
  // lastOutboundEmailAt/lastInboundEmailAt let the cadence cron (see
  // src/lib/emails/cadence.ts) tell "no reply yet" apart from "they replied"
  // without re-scanning the full activities table on every run.
  // followUpCount caps the automated 3/6/9-day nudges at 3; followUpFlaggedAt
  // is the "needs a look" marker that both sorts the deal to the top of its
  // board column (see listDealsForBoard) and gates the cadence cron from
  // re-flagging something already surfaced.
  lastOutboundEmailAt: timestamp("last_outbound_email_at", { withTimezone: true }),
  lastInboundEmailAt: timestamp("last_inbound_email_at", { withTimezone: true }),
  followUpCount: integer("follow_up_count").notNull().default(0),
  followUpFlaggedAt: timestamp("follow_up_flagged_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// activities — every touch: email, call, sms, linkedin, note, meeting
// ---------------------------------------------------------------------------

export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id),
  dealId: uuid("deal_id").references(() => deals.id),
  type: activityTypeEnum("type").notNull(),
  direction: activityDirectionEnum("direction").notNull(),
  bodyText: text("body_text"),
  channelMeta: jsonb("channel_meta").$type<Record<string, unknown>>(),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// messages — delivery detail for sent/received activities
// ---------------------------------------------------------------------------

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityId: uuid("activity_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  provider: messageProviderEnum("provider").notNull(),
  providerMessageId: text("provider_message_id"),
  threadId: text("thread_id"),
  status: messageStatusEnum("status").notNull().default("draft"),
  // Which of the 3 rotating Gmail accounts (0/1/2, matching
  // GMAIL_*_1/2/3 — see email_send_accounts above) this message went out
  // from or came in on. Needed so a reply typed on the company page goes
  // out from the same mailbox the thread already lives in, not whichever
  // account happens to be next in the send rotation.
  accountIndex: integer("account_index"),
  toAddress: text("to_address"),
  fromAddress: text("from_address"),
  subject: text("subject"),
  body: text("body"),
  generatedByAi: boolean("generated_by_ai").notNull().default(false),
  aiPromptVersion: text("ai_prompt_version"),

  // --- Delivery/open/bounce tracking (v1.1) ---
  // trackingToken is embedded in the 1x1 pixel URL (src/app/api/pixel/[token])
  // baked into every outbound HTML email; null for inbound messages and for
  // anything sent before this shipped (can't be retrofitted onto already-sent
  // mail, per the original ask). rfc822MessageId is the real Message-ID
  // header (distinct from providerMessageId, which is Gmail's internal id) —
  // needed to build correct In-Reply-To/References headers when replying.
  trackingToken: text("tracking_token").unique(),
  rfc822MessageId: text("rfc822_message_id"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  bounceReason: text("bounce_reason"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// templates — reusable outreach copy, by channel
// ---------------------------------------------------------------------------

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  channel: templateChannelEnum("channel").notNull(),
  subjectTemplate: text("subject_template"),
  bodyTemplate: text("body_template").notNull(),
  variables: jsonb("variables").$type<string[]>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// outreach_sequences / sequence_steps — multi-step cadences (Phase 4)
// ---------------------------------------------------------------------------

export const outreachSequences = pgTable("outreach_sequences", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  sequenceId: uuid("sequence_id")
    .notNull()
    .references(() => outreachSequences.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  channel: templateChannelEnum("channel").notNull(),
  delayDays: integer("delay_days").notNull().default(0),
  templateId: uuid("template_id").references(() => templates.id),
});

// ---------------------------------------------------------------------------
// tasks — follow-up reminders (optionally synced to Calendar, Phase 5)
// ---------------------------------------------------------------------------

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  assignedTo: uuid("assigned_to").references(() => users.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // --- Calendar sync (Phase 5) ---
  durationMinutes: integer("duration_minutes").notNull().default(30),
  location: text("location"),
  googleEventId: text("google_event_id"),
  googleEventSyncedAt: timestamp("google_event_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// ai_runs — audit + cost log for every AI call (§5)
// ---------------------------------------------------------------------------

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetType: aiRunTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id"),
  model: text("model").notNull(),
  prompt: text("prompt"),
  tokensUsed: integer("tokens_used"),
  costEstimateUsd: numeric("cost_estimate_usd", { precision: 8, scale: 4 }),
  result: jsonb("result").$type<Record<string, unknown>>(),
  status: aiRunStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// lead_sources_config — which discovery/enrichment sources are active
// ---------------------------------------------------------------------------

export const leadSourcesConfig = pgTable("lead_sources_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: leadSourceTypeEnum("type").notNull(),
  // e.g. { keyword: "HVAC contractor", radiusMiles: 25, franchiseBlocklist: [...] }
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// discovery_runs — one row per "Find Leads" search, so the UI can show live
// progress while the background job widens its search radius to hit the
// user's requested qualified-lead count without loosening the quality bar.
// ---------------------------------------------------------------------------

export const discoveryRuns = pgTable("discovery_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  area: text("area").notNull(),
  keyword: text("keyword").notNull(),
  targetCount: integer("target_count").notNull(),
  foundCount: integer("found_count").notNull().default(0),
  radiusMiles: integer("radius_miles"), // current/final search radius from the area's center
  status: discoveryRunStatusEnum("status").notNull().default("running"),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});



// ---------------------------------------------------------------------------
// email_drafts — pending-review emails (Phase 3)
// ---------------------------------------------------------------------------

export const emailDrafts = pgTable("email_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id").references(() => deals.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: emailDraftStatusEnum("status").notNull().default("pending_review"),
  // What triggered this draft (v1.1) — see emailDraftKindEnum above.
  // Defaults to cold_outreach so every pre-v1.1 draft reads correctly.
  kind: emailDraftKindEnum("kind").notNull().default("cold_outreach"),
  // Set only for kind = 'reply' — the inbound message being answered.
  // sendApprovedDraft reads its threadId/accountIndex/rfc822MessageId off
  // this row so the response goes out in-thread, from the same mailbox.
  inReplyToMessageId: uuid("in_reply_to_message_id").references(() => messages.id),
  aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedBy: uuid("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentFromEmailIndex: integer("sent_from_email_index"),
  messageId: uuid("message_id").references(() => messages.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// email_send_accounts — warm-up state for the 3 rotating Gmail sending
// accounts (Phase 3). One row per account (accountIndex 0/1/2, matching
// GMAIL_*_1/2/3 in env), created lazily on first use by
// src/lib/data/email-accounts.ts.
//
// This used to live as warmup_status/daily_send_count/etc. columns on
// `companies` — wrong entity: warm-up limits the sending account's daily
// volume across every recipient, not any one recipient's own count, so
// tracking it per-company meant the cap never actually engaged (every new
// company started its own count at 0). Moved here so the daily cap and
// minimum-spacing check in src/lib/warmup/schedule.ts apply per account.
// ---------------------------------------------------------------------------

export const emailSendAccounts = pgTable("email_send_accounts", {
  accountIndex: integer("account_index").primaryKey(), // 0, 1, or 2
  warmupStatus: text("warmup_status").notNull().default("not_started"),
  warmupStartedAt: timestamp("warmup_started_at", { withTimezone: true }),
  dailySendCount: integer("daily_send_count").notNull().default(0),
  lastSendResetAt: timestamp("last_send_reset_at", { withTimezone: true }),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// booking_settings — single-row config for the public /book page (Phase 6).
// Gavin-only: how far out prospects can book, meeting length, working
// hours/days used to generate open slots (on top of real Google Calendar
// busy time).
// ---------------------------------------------------------------------------

export const bookingSettings = pgTable("booking_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingWindowDays: integer("booking_window_days").notNull().default(30),
  meetingDurationMinutes: integer("meeting_duration_minutes").notNull().default(30),
  minNoticeHours: integer("min_notice_hours").notNull().default(4),
  timezone: text("timezone").notNull().default("America/Winnipeg"),
  // 0 = Sunday ... 6 = Saturday
  workingDays: jsonb("working_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5]),
  workingHoursStart: text("working_hours_start").notNull().default("09:00"),
  workingHoursEnd: text("working_hours_end").notNull().default("17:00"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// booking_questions — the customizable questionnaire shown after a prospect
// picks a time. Three "core" rows (name/email/phone) are seeded and can't
// be deleted from the UI since reminders depend on them; anything else is
// free-form and fully editable (Phase 6).
// ---------------------------------------------------------------------------

export const bookingQuestions = pgTable("booking_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  fieldType: bookingQuestionTypeEnum("field_type").notNull().default("text"),
  options: jsonb("options").$type<string[]>(),
  required: boolean("required").notNull().default(true),
  isCore: boolean("is_core").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// bookings — a confirmed slot on the public /book page (Phase 6). Optionally
// linked back to a company/contact/deal when the link was sent from the CRM
// (?company=&contact=&deal= query params), but works as a bare public link
// too. answers stores the full questionnaire response keyed by question id;
// prospectName/Email/Phone are pulled out of the core answers at booking
// time so reminders don't need to re-parse the jsonb blob.
// ---------------------------------------------------------------------------

export const bookings = pgTable("bookings", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
  prospectName: text("prospect_name").notNull(),
  prospectEmail: text("prospect_email").notNull(),
  prospectPhone: text("prospect_phone"),
  answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: bookingStatusEnum("status").notNull().default("confirmed"),
  googleEventId: text("google_event_id"),
  emailReminder24hSentAt: timestamp("email_reminder_24h_sent_at", { withTimezone: true }),
  emailReminder1hSentAt: timestamp("email_reminder_1h_sent_at", { withTimezone: true }),
  smsReminder24hSentAt: timestamp("sms_reminder_24h_sent_at", { withTimezone: true }),
  smsReminder1hSentAt: timestamp("sms_reminder_1h_sent_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// audit_log — who (or which AI run) changed what
// ---------------------------------------------------------------------------

export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(), // e.g. "deal.stage_changed"
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  diff: jsonb("diff").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (for typed nested reads via Drizzle's query API)
// ---------------------------------------------------------------------------

export const companiesRelations = relations(companies, ({ many }) => ({
  contacts: many(contacts),
  deals: many(deals),
  activities: many(activities),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  company: one(companies, { fields: [contacts.companyId], references: [companies.id] }),
  activities: many(activities),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  company: one(companies, { fields: [deals.companyId], references: [companies.id] }),
  stage: one(pipelineStages, { fields: [deals.stageId], references: [pipelineStages.id] }),
  owner: one(users, { fields: [deals.ownerUserId], references: [users.id] }),
  activities: many(activities),
  tasks: many(tasks),
}));

export const pipelineStagesRelations = relations(pipelineStages, ({ many }) => ({
  deals: many(deals),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  company: one(companies, { fields: [activities.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [activities.contactId], references: [contacts.id] }),
  deal: one(deals, { fields: [activities.dealId], references: [deals.id] }),
  message: one(messages, { fields: [activities.id], references: [messages.activityId] }),
  createdByUser: one(users, { fields: [activities.createdBy], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  activity: one(activities, { fields: [messages.activityId], references: [activities.id] }),
}));

export const outreachSequencesRelations = relations(outreachSequences, ({ many }) => ({
  steps: many(sequenceSteps),
}));

export const sequenceStepsRelations = relations(sequenceSteps, ({ one }) => ({
  sequence: one(outreachSequences, {
    fields: [sequenceSteps.sequenceId],
    references: [outreachSequences.id],
  }),
  template: one(templates, { fields: [sequenceSteps.templateId], references: [templates.id] }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  deal: one(deals, { fields: [tasks.dealId], references: [deals.id] }),
  company: one(companies, { fields: [tasks.companyId], references: [companies.id] }),
  assignee: one(users, { fields: [tasks.assignedTo], references: [users.id] }),
}));


export const emailDraftsRelations = relations(emailDrafts, ({ one }) => ({
  company: one(companies, { fields: [emailDrafts.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [emailDrafts.contactId], references: [contacts.id] }),
  deal: one(deals, { fields: [emailDrafts.dealId], references: [deals.id] }),
  aiRun: one(aiRuns, { fields: [emailDrafts.aiRunId], references: [aiRuns.id] }),
  approver: one(users, { fields: [emailDrafts.approvedBy], references: [users.id] }),
  rejecter: one(users, { fields: [emailDrafts.rejectedBy], references: [users.id] }),
  message: one(messages, { fields: [emailDrafts.messageId], references: [messages.id] }),
  inReplyToMessage: one(messages, {
    fields: [emailDrafts.inReplyToMessageId],
    references: [messages.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  company: one(companies, { fields: [bookings.companyId], references: [companies.id] }),
  contact: one(contacts, { fields: [bookings.contactId], references: [contacts.id] }),
  deal: one(deals, { fields: [bookings.dealId], references: [deals.id] }),
}));