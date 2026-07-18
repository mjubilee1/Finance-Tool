import { defaultCarProfile, type CarProfileLike } from "@/lib/car";
import { prisma } from "@/lib/prisma";

export async function getOrCreateCarProfile(userId: string): Promise<CarProfileLike & { id: string }> {
  const defaults = defaultCarProfile();
  const profile = await prisma.carProfile.upsert({
    where: { userId },
    create: {
      userId,
      paymentMonthly: defaults.paymentMonthly,
      paymentNextDue: defaults.paymentNextDue,
      insuranceMonthly: defaults.insuranceMonthly,
      insuranceNextDue: defaults.insuranceNextDue,
      notes: null,
    },
    update: {},
  });

  return {
    id: profile.id,
    paymentMonthly: profile.paymentMonthly,
    paymentNextDue: profile.paymentNextDue,
    insuranceMonthly: profile.insuranceMonthly,
    insuranceNextDue: profile.insuranceNextDue,
    notes: profile.notes,
  };
}
