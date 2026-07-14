"use client";

import { useQuery } from "@tanstack/react-query";
import type { MentionContact } from "@/lib/contact-mention-input";

type ContactsResponse = {
  contacts: MentionContact[];
};

async function fetchMentionContacts() {
  const response = await fetch("/api/growth/contacts?lite=1");
  if (!response.ok) {
    throw new Error("Failed to load contacts.");
  }
  return response.json() as Promise<ContactsResponse>;
}

export function useGrowthContacts(enabled = true) {
  return useQuery({
    queryKey: ["growth-contacts", "lite"],
    queryFn: fetchMentionContacts,
    enabled,
    staleTime: 60_000,
  });
}
