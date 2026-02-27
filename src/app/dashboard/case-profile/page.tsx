"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import CaseProfileSection from "@/components/settings/CaseProfileSection";
import { hasCaseProfileAccess } from "@/lib/plans/access";

export default function CaseProfilePage() {
  const [planLoaded, setPlanLoaded] = useState(false);
  const [canAccess, setCanAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadPlan = async () => {
      try {
        const res = await fetch("/api/user/plan", { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setCanAccess(hasCaseProfileAccess(data?.plan || ""));
      } catch {
        if (!cancelled) setCanAccess(false);
      } finally {
        if (!cancelled) setPlanLoaded(true);
      }
    };

    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!planLoaded) {
    return (
      <div className="purple-gradient-bg app-shell">
        <div className="app-container">
          <div style={{ color: "white", padding: "24px 0" }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="purple-gradient-bg app-shell">
        <div className="app-container">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Link href="/dashboard" className="app-button-secondary">
              <ArrowLeft className="w-5 h-5" />
              Go to Dashboard
            </Link>
          </div>

          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-indigo-200" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Plan required</h2>
                <p className="text-indigo-100/80">Case Profile is available on Premium and Premium + plans.</p>
              </div>
            </div>
            <p className="text-indigo-100/80 mb-6">
              Upgrade to Premium or Premium + to create and manage your personalised case profile.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-5 py-3 bg-white text-purple-900 font-semibold rounded-lg hover:bg-indigo-50"
              >
                View plans
              </Link>
              <Link
                href="/settings"
                className="inline-flex items-center gap-2 px-5 py-3 border border-white/30 text-white rounded-lg hover:bg-white/10"
              >
                Manage billing
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="purple-gradient-bg app-shell">
      <div className="app-container">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <Link href="/dashboard" className="app-button-secondary">
            Go to Dashboard
          </Link>
        </div>
        <CaseProfileSection enforceReadOnlyOnPlanPause />
      </div>
    </div>
  );
}
