import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Resolve the owner record for this single-user app.
 *
 * APP_USER_ID is optional for existing installs. When it is absent, the oldest
 * user is the original owner created before the app switched away from login.
 */
export async function getAppUser() {
  const configuredUserId = process.env.APP_USER_ID?.trim();

  if (configuredUserId) {
    return prisma.user.findUnique({
      where: { id: configuredUserId },
      select: { id: true, name: true, email: true },
    });
  }

  return prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
}
