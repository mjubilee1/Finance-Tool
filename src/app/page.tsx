import { Dashboard } from "@/components/dashboard";
import { PasscodeLock } from "@/components/passcode-lock";

export default function Home() {
  return (
    <PasscodeLock>
      <Dashboard />
    </PasscodeLock>
  );
}
