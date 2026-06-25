import { getAppVersion, getAppVersionDetail } from "@/lib/version";

type AppVersionProps = {
  className?: string;
};

export function AppVersion({ className = "" }: AppVersionProps) {
  const { label } = getAppVersion();
  const detail = getAppVersionDetail();

  return (
    <p
      className={`text-[10px] text-slate-400 tabular-nums ${className}`}
      title={detail}
    >
      {label}
    </p>
  );
}
