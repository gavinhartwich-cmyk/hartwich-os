"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Globe, Phone, MessageSquare, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";

export default function OutreachSuggestionsPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [painPoints, setPainPoints] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{
    email: string;
    linkedin: string;
    phone: string;
    instagram: string;
  } | null>(null);

  async function generateSuggestions() {
    if (!companyName.trim()) {
      alert("Please enter company name");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/outreach/generate-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim() || "Hiring Manager",
          contactTitle: contactTitle.trim() || "Decision Maker",
          painPoints: painPoints.trim() || "Review management and customer retention",
        }),
      });

      const data = await response.json();
      setSuggestions(data.suggestions);
    } catch (error) {
      alert("Error generating suggestions");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-50 to-neutral-100 p-6 dark:from-neutral-900 dark:to-neutral-950">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-2 hover:bg-neutral-200 dark:hover:bg-neutral-800"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-3xl font-bold">Personalized Outreach</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Input Form */}
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
            <h2 className="mb-4 text-lg font-semibold">Company Info</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., ABC HVAC Solutions"
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g., John Smith"
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Contact Title
                </label>
                <input
                  type="text"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  placeholder="e.g., Owner, Manager"
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Pain Points / Context
                </label>
                <textarea
                  value={painPoints}
                  onChange={(e) => setPainPoints(e.target.value)}
                  placeholder="What challenges do they likely face? (optional)"
                  rows={3}
                  className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
              </div>

              <button
                onClick={generateSuggestions}
                disabled={loading || !companyName.trim()}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 inline size-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Suggestions"
                )}
              </button>
            </div>
          </div>

          {/* Suggestions */}
          {suggestions && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  ✓ Personalized suggestions generated
                </p>
              </div>

              {/* Email */}
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2">
                  <Mail className="size-5 text-blue-600" />
                  <h3 className="font-semibold">Email Outreach</h3>
                </div>
                <p className="whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-800">
                  {suggestions.email}
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(suggestions.email)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>

              {/* LinkedIn */}
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2">
                  <Globe className="size-5 text-blue-700" />
                  <h3 className="font-semibold">LinkedIn Connection</h3>
                </div>
                <p className="whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-800">
                  {suggestions.linkedin}
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(suggestions.linkedin)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>

              {/* Phone */}
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2">
                  <Phone className="size-5 text-green-600" />
                  <h3 className="font-semibold">Phone Outreach Script</h3>
                </div>
                <p className="whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-800">
                  {suggestions.phone}
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(suggestions.phone)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>

              {/* Instagram */}
              <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="size-5 text-pink-600" />
                  <h3 className="font-semibold">Instagram DM</h3>
                </div>
                <p className="whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-800">
                  {suggestions.instagram}
                </p>
                <button
                  onClick={() => navigator.clipboard.writeText(suggestions.instagram)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
