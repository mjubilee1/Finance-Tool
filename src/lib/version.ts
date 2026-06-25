export type AppVersionInfo = {
  version: string;
  commit: string;
  builtAt: string;
  label: string;
};

function formatBuiltAt(iso: string): string {
  if (!iso) return "local dev";

  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function getAppVersion(): AppVersionInfo {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev";
  const builtAt = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

  return {
    version,
    commit,
    builtAt,
    label: `v${version} (${commit})`,
  };
}

export function getAppVersionDetail(): string {
  const { version, commit, builtAt } = getAppVersion();
  return `v${version} · ${commit} · ${formatBuiltAt(builtAt)}`;
}
