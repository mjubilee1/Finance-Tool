"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Lock, Mail, ArrowRight, Loader2 } from "lucide-react";
import { clearAppUnlock, isAppUnlocked, unlockApp } from "@/lib/device-trust";

export function PasscodeLock({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [step, setStep] = useState<"initial" | "sending" | "enter_code" | "verifying">("initial");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsUnlocked(isAppUnlocked());
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      clearAppUnlock();
      setIsUnlocked(false);
    }
  }, [status]);

  // Avoid a blank first paint while localStorage unlock state is read.
  // Do not render children here — financial UI must stay gated until unlock is known.
  if (!mounted || status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-3 text-zinc-500 dark:text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-medium">Loading Life OS…</p>
        </div>
      </div>
    );
  }

  // Unauthenticated: skip lock screen (dashboard / login handle the next step)
  if (status === "unauthenticated") {
    return <>{children}</>;
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  const handleSendCode = async () => {
    setStep("sending");
    setError("");
    try {
      const res = await fetch("/api/auth/passcode/send", { method: "POST" });
      if (res.ok) {
        setStep("enter_code");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to send passcode");
        setStep("initial");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setStep("initial");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.length !== 6) {
      setError("Passcode must be 6 digits");
      return;
    }

    setStep("verifying");
    setError("");
    try {
      const res = await fetch("/api/auth/passcode/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (res.ok) {
        unlockApp(rememberDevice);
        setIsUnlocked(true);
      } else {
        const data = await res.json();
        setError(data.error || "Invalid passcode");
        setStep("enter_code");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setStep("enter_code");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-8 border border-zinc-200 dark:border-zinc-800 text-center">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8" />
        </div>
        
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">App Locked</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">
          For your security, please verify your identity to access your financial data.
        </p>

        {error && (
          <div className="bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-300 p-3 rounded-xl text-sm mb-6 border border-rose-100 dark:border-rose-900">
            {error}
          </div>
        )}

        {step === "initial" || step === "sending" ? (
          <div className="space-y-4">
            <button
              onClick={handleSendCode}
              disabled={step === "sending"}
              className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-70"
            >
              {step === "sending" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" />
                  Send Passcode to Email
                </>
              )}
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              On your phone? Turn on &ldquo;Remember this device&rdquo; after you enter the code so you
              don&apos;t have to unlock every time you switch apps.
            </p>
          </div>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label htmlFor="passcode" className="sr-only">Passcode</label>
              <input
                id="passcode"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter 6-digit code"
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-zinc-100"
                autoFocus
              />
            </div>

            <label className="flex items-center justify-center gap-2.5 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              Remember this device for 30 days
            </label>

            <button
              type="submit"
              disabled={passcode.length !== 6 || step === "verifying"}
              className="w-full bg-emerald-600 text-white py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {step === "verifying" ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Unlock App
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSendCode}
              className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mt-4 block w-full"
            >
              Didn&apos;t receive it? Send again
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
