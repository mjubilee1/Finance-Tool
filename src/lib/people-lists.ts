import {
  isBuilderContactType,
  isTop10ContactType,
  normalizeContactStatus,
  normalizeContactType,
} from "@/lib/growth-contact-shared";
import { scoreNetworkLeverage } from "@/lib/network-leverage";

export type WeeklyPerson = {
  id: string;
  name: string;
  relationshipType: string | null;
  status: string;
  lastContactDate: string | null;
  suggestedNextAction: string | null;
  nextActionDate?: string | null;
  mutualValue?: string | null;
  asksOffers?: string | null;
};

function byLastContactDesc(a: WeeklyPerson, b: WeeklyPerson) {
  return (b.lastContactDate ?? "").localeCompare(a.lastContactDate ?? "");
}

export function buildWeeklyPeopleLists<T extends WeeklyPerson>(contacts: T[], today: string) {
  const top10 = contacts
    .filter((contact) => {
      if (!isTop10ContactType(contact.relationshipType)) return false;
      const status = normalizeContactStatus(contact.status);
      return status === "active" || status === "warm" || status === "quiet";
    })
    .map((contact) => ({
      contact,
      score: scoreNetworkLeverage(contact, today).score,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return byLastContactDesc(a.contact, b.contact);
    })
    .slice(0, 10)
    .map((row) => row.contact);

  const followUps = contacts
    .filter((contact) => {
      if (normalizeContactStatus(contact.status) === "dormant") return false;
      const due = contact.nextActionDate?.trim();
      return Boolean(due && due <= today);
    })
    .sort((a, b) => (a.nextActionDate ?? "").localeCompare(b.nextActionDate ?? ""));

  const used = new Set([...top10, ...followUps].map((contact) => contact.id));
  const intros = contacts
    .filter((contact) => {
      if (used.has(contact.id)) return false;
      if (normalizeContactStatus(contact.status) === "dormant") return false;
      const type = normalizeContactType(contact.relationshipType);
      if (type !== "connector" && type !== "founder" && type !== "media_events") {
        return false;
      }
      return !contact.lastContactDate || contact.lastContactDate <= today;
    })
    .sort(byLastContactDesc)
    .slice(0, 3);

  const introFallback =
    intros.length >= 3
      ? intros
      : [
          ...intros,
          ...contacts
            .filter(
              (contact) =>
                isBuilderContactType(contact.relationshipType) &&
                normalizeContactStatus(contact.status) !== "dormant" &&
                !used.has(contact.id) &&
                !intros.some((item) => item.id === contact.id) &&
                !contact.mutualValue?.trim() &&
                !contact.asksOffers?.trim(),
            )
            .slice(0, 3 - intros.length),
        ];

  return { top10, followUps, intros: introFallback };
}
