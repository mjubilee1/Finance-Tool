import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

function LoginFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 app-page">
      <div className="w-full max-w-sm app-card-elevated p-8">
        <p className="app-label text-blue-700 mb-2">Life OS</p>
        <h1 className="text-2xl app-display mb-2 text-slate-900">Welcome back</h1>
        <p className="text-slate-500 text-sm">Loading sign in…</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
