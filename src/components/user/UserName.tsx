"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";
import type { User } from "@supabase/supabase-js";

function deriveName(u: User | null): string {
  if (!u) return "Account";
  const meta = u.user_metadata || {};
  if (meta.full_name && meta.full_name.trim()) return meta.full_name.trim();
  if (meta.display_name && meta.display_name.trim()) return meta.display_name.trim();
  const first = meta.first_name?.trim();
  const last = meta.last_name?.trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (u.email) return u.email.split("@")[0];
  return "Account";
}

type UserNameProps = {
  className?: string;
  variant?: 'full' | 'first';
  style?: CSSProperties;
};

export default function UserName({ className, variant = 'full', style }: UserNameProps) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const name = deriveName(user);
  const displayName = variant === 'first' ? (name?.split(' ')[0] || name) : name;

  return (
    <span
      className={className}
      style={{ color: "#ffffff", fontWeight: 600, ...style }}
    >
      {displayName}
    </span>
  );
}
