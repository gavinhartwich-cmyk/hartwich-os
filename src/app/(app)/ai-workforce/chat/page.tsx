import { redirect } from "next/navigation";
import PageHeader from "@/components/page-header";
import { getCurrentAppUser } from "@/lib/auth/current-user";
import { isBookingAdmin } from "@/lib/auth/allowlist";
import { listChatMessages } from "@/lib/data/ai-workforce-chat";
import ChatPanel from "@/components/ai-workforce/chat-panel";

export const dynamic = "force-dynamic";

/** Gavin-only, same gate/redirect pattern as the rest of /ai-workforce. */
export default async function SalesManagerChatPage() {
  const user = await getCurrentAppUser();
  if (!user || !isBookingAdmin(user.email)) {
    redirect("/board");
  }

  const messages = await listChatMessages();

  return (
    <div>
      <PageHeader
        title="Talk to the Sales Manager"
        subtitle="Set goals, ask about status, discuss strategy — grounded in real current data, not a script."
        back={{ href: "/ai-workforce", label: "AI Workforce" }}
      />
      <ChatPanel messages={messages} />
    </div>
  );
}
