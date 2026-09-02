export const metadata = { title: "Privacy Policy — Hartwich OS" };

/**
 * Public privacy policy (required by Google's OAuth consent screen to move
 * the project's OAuth app out of Testing mode — Testing-mode refresh tokens
 * hard-expire after 7 days, which is what broke Gmail/Calendar sync).
 * Lives outside the (app) route group (no auth) and is listed in
 * proxy.ts PUBLIC_PATHS. Internal single-owner tool, so this describes
 * Hartwich Labs' own use of its own accounts, not a public product.
 */
export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", lineHeight: 1.6 }}>
      <h1>Privacy Policy — Hartwich OS</h1>
      <p>
        Hartwich OS is an internal sales/CRM tool built and used solely by
        Hartwich Labs (Gavin Hartwich) to run Hartwich Labs&apos; own outreach
        to prospective HVAC-industry customers. It is not a public product,
        has no public sign-up, and is not distributed to anyone outside
        Hartwich Labs.
      </p>

      <h2>Data this app accesses</h2>
      <ul>
        <li>
          <strong>Gmail</strong> — sends and reads email on behalf of the
          Hartwich Labs Gmail accounts it is authorized for, to draft, send,
          and track outreach emails and to detect replies.
        </li>
        <li>
          <strong>Google Calendar</strong> — reads free/busy availability
          and creates or updates events on the authorized calendar to
          schedule meetings booked through this app.
        </li>
        <li>
          <strong>Business contact data</strong> — company names, contact
          names, emails, and phone numbers entered manually or discovered
          by the app&apos;s lead-research tools, stored in a private
          database.
        </li>
      </ul>

      <h2>How this data is used</h2>
      <p>
        Solely to operate Hartwich Labs&apos; own sales process. It is never
        sold, shared with third parties, or used for advertising. Access is
        restricted to Hartwich Labs&apos; own authorized Google accounts.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:gavinhartwich@gmail.com">gavinhartwich@gmail.com</a>
      </p>
    </main>
  );
}
