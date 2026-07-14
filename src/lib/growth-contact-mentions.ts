import { prisma } from "@/lib/prisma";

export type ContactRef = { id: string; name: string };

const AT_MENTION_RE = /@([A-Za-z][A-Za-z0-9._\- ]{0,48})/g;

export function parseAtMentions(text: string): string[] {
  const mentions: string[] = [];
  for (const match of text.matchAll(AT_MENTION_RE)) {
    const name = match[1]?.trim();
    if (name) mentions.push(name);
  }
  return [...new Set(mentions)];
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function resolveContactMentions(
  mentions: string[],
  contacts: ContactRef[],
): ContactRef[] {
  if (mentions.length === 0 || contacts.length === 0) return [];

  const resolved: ContactRef[] = [];
  const used = new Set<string>();

  for (const mention of mentions) {
    const needle = normalizeName(mention);
    if (!needle) continue;

    const exact = contacts.find((contact) => normalizeName(contact.name) === needle);
    if (exact && !used.has(exact.id)) {
      resolved.push(exact);
      used.add(exact.id);
      continue;
    }

    const prefixMatches = contacts.filter((contact) => {
      const normalized = normalizeName(contact.name);
      return normalized.startsWith(needle) || needle.startsWith(normalized);
    });

    if (prefixMatches.length === 1 && !used.has(prefixMatches[0].id)) {
      resolved.push(prefixMatches[0]);
      used.add(prefixMatches[0].id);
    }
  }

  return resolved;
}

export async function touchContactsFromMentions(
  userId: string,
  contactIds: string[],
  contactDate: string,
  context?: string,
) {
  if (contactIds.length === 0) return;

  const uniqueIds = [...new Set(contactIds)];
  const contacts = await prisma.growthContact.findMany({
    where: { userId, id: { in: uniqueIds } },
    select: { id: true, lastContactDate: true },
  });

  for (const contact of contacts) {
    const shouldUpdate =
      !contact.lastContactDate || contact.lastContactDate <= contactDate;
    if (!shouldUpdate) continue;

    await prisma.growthContact.update({
      where: { id: contact.id },
      data: {
        lastContactDate: contactDate,
        status: "active",
      },
    });

    if (context?.trim()) {
      await prisma.growthContactNote.create({
        data: {
          userId,
          contactId: contact.id,
          body: context.trim().slice(0, 500),
        },
      });
    }
  }
}

export async function linkActivityMentions(
  userId: string,
  text: string,
  activityDate: string,
  activityTitle: string,
) {
  const mentions = parseAtMentions(text);
  if (mentions.length === 0) return [];

  const contacts = await prisma.growthContact.findMany({
    where: { userId },
    select: { id: true, name: true },
  });
  const matched = resolveContactMentions(mentions, contacts);
  if (matched.length === 0) return [];

  await touchContactsFromMentions(
    userId,
    matched.map((contact) => contact.id),
    activityDate,
    `Logged activity: ${activityTitle}`,
  );

  return matched;
}
