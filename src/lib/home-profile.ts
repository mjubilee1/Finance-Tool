import {
  defaultHomeProfile,
  HOME_DEFAULT_TENANT_SLOTS,
  type HomeProfileLike,
} from "@/lib/home";
import { prisma } from "@/lib/prisma";

function toHomeProfileLike(profile: {
  id: string;
  mortgageMonthly: number;
  mortgageNextDue: string;
  propertyLabel: string;
  notes: string | null;
}): HomeProfileLike & { id: string } {
  return {
    id: profile.id,
    mortgageMonthly: profile.mortgageMonthly,
    mortgageNextDue: profile.mortgageNextDue,
    propertyLabel: profile.propertyLabel,
    notes: profile.notes,
  };
}

export async function getOrCreateHomeProfile(
  userId: string,
): Promise<HomeProfileLike & { id: string }> {
  const defaults = defaultHomeProfile();
  const existing = await prisma.homeProfile.findUnique({ where: { userId } });
  if (existing) return toHomeProfileLike(existing);

  const profile = await prisma.homeProfile.create({
    data: {
      userId,
      mortgageMonthly: defaults.mortgageMonthly,
      mortgageNextDue: defaults.mortgageNextDue,
      propertyLabel: defaults.propertyLabel,
      notes: null,
      tenants: {
        create: HOME_DEFAULT_TENANT_SLOTS.map((slot) => ({
          userId,
          name: slot.name,
          unitLabel: slot.unitLabel,
          expectedRent: slot.expectedRent,
          status: "active",
        })),
      },
    },
  });

  return toHomeProfileLike(profile);
}
