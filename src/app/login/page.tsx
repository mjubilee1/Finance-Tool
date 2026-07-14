"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppVersion } from "@/components/app-version";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!isLogin) {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Registration failed");
        }
      }

      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      router.push(callbackUrl.startsWith("/") ? callbackUrl : "/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] p-4 app-page">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <div className="w-full max-w-sm app-card-elevated p-8">
        <p className="app-label text-blue-700 mb-2">Life OS</p>
        <h1 className="text-2xl app-display mb-2 text-slate-900">
          {isLogin ? "Welcome back" : "Create account"}
        </h1>
        <p className="text-slate-500 mb-8 text-sm">
          Enter your details to continue to your life OS.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-transparent text-zinc-900 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-transparent text-zinc-900 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-900 text-white py-3 rounded-xl font-medium hover:opacity-90 disabled:opacity-50 mt-4"
          >
            {loading ? "Please wait..." : (isLogin ? "Sign in" : "Sign up")}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>

        <AppVersion className="mt-6 text-center" />
      </div>
    </div>
  );
}