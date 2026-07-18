import { defaultCarProfile, type CarProfileLike } from "@/lib/car";
import { prisma } from "@/lib/prisma";

function toCarProfileLike(profile: {
  id: string;
  paymentMonthly: number;
  paymentNextDue: string;
  insuranceMonthly: number;
  insuranceNextDue: string;
  loanAmount: number;
  loanBalance: number;
  loanTermMonths: number;
  loanStartDate: string;
  payoffTargetMonthly: number;
  startOdometerMiles: number;
  odometerMiles: number;
  odometerAsOf: string;
  notes: string | null;
}): CarProfileLike & { id: string } {
  return {
    id: profile.id,
    paymentMonthly: profile.paymentMonthly,
    paymentNextDue: profile.paymentNextDue,
    insuranceMonthly: profile.insuranceMonthly,
    insuranceNextDue: profile.insuranceNextDue,
    loanAmount: profile.loanAmount,
    loanBalance: profile.loanBalance,
    loanTermMonths: profile.loanTermMonths,
    loanStartDate: profile.loanStartDate,
    payoffTargetMonthly: profile.payoffTargetMonthly,
    startOdometerMiles: profile.startOdometerMiles,
    odometerMiles: profile.odometerMiles,
    odometerAsOf: profile.odometerAsOf,
    notes: profile.notes,
  };
}

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
      loanAmount: defaults.loanAmount,
      loanBalance: defaults.loanBalance,
      loanTermMonths: defaults.loanTermMonths,
      loanStartDate: defaults.loanStartDate,
      payoffTargetMonthly: defaults.payoffTargetMonthly,
      startOdometerMiles: defaults.startOdometerMiles,
      odometerMiles: defaults.odometerMiles,
      odometerAsOf: defaults.odometerAsOf,
      notes: null,
    },
    update: {},
  });

  return toCarProfileLike(profile);
}
