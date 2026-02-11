"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./drafts.module.css";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";

type DraftStatus = "in-progress" | "completed";
type DraftItem = {
  id: string;
  title: string;
  updatedAt: number; // epoch ms
  status: DraftStatus;
  type: "letter" | "statement" | "motion" | "other";
};

// Fixed timestamps to avoid SSR/CSR hydration mismatches
const sampleDrafts: DraftItem[] = [
  { id: "d1", title: "Letter: Response to Claim", updatedAt: new Date("2025-11-25T11:00:00Z").getTime(), status: "in-progress", type: "letter" },
  { id: "d2", title: "Statement: Witness Smith", updatedAt: new Date("2025-11-24T12:30:00Z").getTime(), status: "completed", type: "statement" },
  { id: "d3", title: "Motion: Adjournment Request", updatedAt: new Date("2025-11-25T12:45:00Z").getTime(), status: "in-progress", type: "motion" },
  { id: "d4", title: "Letter: Court Listing Query", updatedAt: new Date("2025-11-23T08:15:00Z").getTime(), status: "completed", type: "letter" },
];

export default function DraftsClient() {
  const router = useRouter();
  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState<"all" | DraftStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | DraftItem["type"]>("all");
  const [sort, setSort] = useState<"updated-desc" | "updated-asc" | "title-asc">("updated-desc");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [drafts, setDrafts] = useState<DraftItem[]>(sampleDrafts);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  interface UserLocal { id?: string; email?: string | null }
  const [user, setUser] = useState<UserLocal | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("drafts:view");
      if (v === "grid" || v === "list") setView(v);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("drafts:view", view);
    } catch {}
  }, [view]);

  // Auth subscription
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user as any || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user as any || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch drafts via API
  useEffect(() => {
    if (!user) {
      setDrafts([]);
      return;
    }
    const fetchDrafts = async () => {
      try {
        const response = await fetch('/api/drafts', { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          const list: DraftItem[] = (data.drafts || []).map((d: any) => ({
            id: d.id,
            title: d.title || 'Untitled draft',
            updatedAt: d.updated_at ? new Date(d.updated_at).getTime() : 0,
            status: d.status === 'completed' ? 'completed' : 'in-progress',
            type: ['letter', 'statement', 'motion', 'other'].includes(d.type) ? d.type : 'letter'
          }));
          setDrafts(list);
        }
      } catch (error) {
        console.error('Failed to fetch drafts:', error);
      }
    };
    fetchDrafts();
  }, [user]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const arr = drafts.filter((d) => {
      const matchesQ = !q || d.title.toLowerCase().includes(q);
      const matchesF = filter === "all" ? true : d.status === filter;
      const matchesT = typeFilter === "all" ? true : d.type === typeFilter;
      return matchesQ && matchesF && matchesT;
    });
    arr.sort((a, b) => {
      if (sort === "updated-desc") return b.updatedAt - a.updatedAt;
      if (sort === "updated-asc") return a.updatedAt - b.updatedAt;
      // title-asc
      return a.title.localeCompare(b.title);
    });
    return arr;
  }, [drafts, queryText, filter, typeFilter, sort]);

  const stats = useMemo(() => {
    const total = drafts.length;
    const inProg = drafts.filter((d) => d.status === "in-progress").length;
    const completed = drafts.filter((d) => d.status === "completed").length;
    const lastUpdated = drafts.length ? Math.max(...drafts.map((d) => d.updatedAt)) : 0;
    return { total, inProg, completed, lastUpdated };
  }, [drafts]);

  const createDraft = async () => {
    if (!user) {
      router.push("/auth/signin");
      return;
    }
    const title = quickTitle.trim() || "Untitled draft";
    setQuickBusy(true);
    try {
      const response = await fetch('/api/drafts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, status: 'in-progress', type: 'letter' })
      });
      if (response.ok) {
        setQuickTitle("");
        // Refresh drafts
        const refreshRes = await fetch('/api/drafts', { credentials: 'include' });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setDrafts(data.drafts || []);
        }
      }
    } catch {
      // no-op
    } finally {
      setQuickBusy(false);
    }
  };

  const deleteDraft = async (id: string) => {
    if (!user) return;
    try {
      await fetch(`/api/drafts?id=${id}`, { method: 'DELETE', credentials: 'include' });
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch {}
  };
  const deleteSelected = async () => {
    if (!user) return;
    const ids = Array.from(selected);
    await Promise.all(ids.map((id) => fetch(`/api/drafts?id=${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {})));
    setDrafts(prev => prev.filter(d => !ids.includes(d.id)));
    setSelected(new Set());
  };
  const markSelected = async (status: DraftStatus) => {
    if (!user) return;
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((id) => fetch('/api/drafts', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      }).catch(() => {}))
    );
    setDrafts(prev => prev.map(d => ids.includes(d.id) ? { ...d, status } : d));
  };
  const clearSelection = () => setSelected(new Set());
  const toggleSelected = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const fmtDate = (ts: number) => {
    const d = new Date(ts);
    // Deterministic formatting to avoid server/client locale or tz drift
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "short",
      timeStyle: "short",
      hour12: false,
      timeZone: "UTC",
    }).format(d);
  };

  const statusPill = (s: DraftStatus) => (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: s === "completed" ? "rgba(16,185,129,0.18)" : "rgba(167,139,250,0.18)",
        border: s === "completed" ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(167,139,250,0.35)",
        color: s === "completed" ? "#a7f3d0" : "#ddd6fe",
        whiteSpace: "nowrap",
      }}
    >
      {s === "completed" ? "Completed" : "In Progress"}
    </span>
  );

  return (
    <div className={styles.wrapper}>
      {/* Quick Create bar */}
      <div className={styles.quick}>
        <input
          className={styles.quickInput}
          placeholder="Enter draft title..."
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') createDraft(); }}
        />
        <button className={styles.quickBtn} onClick={createDraft} disabled={quickBusy}>
          {quickBusy ? 'Creating…' : 'Create'}
        </button>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <div className={styles.searchWrap}>
            <i className={`bx bx-search ${styles.searchIcon}`} />
            <input
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search drafts..."
              className={styles.search}
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className={styles.filter}
          >
            <option value="all">All</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className={styles.filter}
          >
            <option value="all">All Types</option>
            <option value="letter">Letter</option>
            <option value="statement">Statement</option>
            <option value="motion">Motion</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className={styles.rightRow}>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className={styles.filter}
          >
            <option value="updated-desc">Updated • Newest</option>
            <option value="updated-asc">Updated • Oldest</option>
            <option value="title-asc">Title • A → Z</option>
          </select>
          <div className={styles.segment}>
            <button
              onClick={() => setView("grid")}
              className={`${styles.segmentBtn} ${view === "grid" ? styles.segmentBtnActive : ""}`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("list")}
              className={`${styles.segmentBtn} ${view === "list" ? styles.segmentBtnActive : ""}`}
            >
              List
            </button>
          </div>
          <button onClick={createDraft} className={styles.newBtn} disabled={quickBusy}>
            <i className="bx bx-plus" /> New Draft
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <div className={styles.grid}>
          {filtered.length === 0 ? (
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <i className="bx bxs-file-find" style={{ color: "#ddd6fe", fontSize: 26 }} />
                <div className={styles.cardTitle}>No drafts match your search</div>
              </div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>Try adjusting filters or create a new draft.</div>
              <div className={styles.cardActions}>
                <a href="/dashboard/documents" className={styles.linkBtn}>Create Draft</a>
              </div>
            </div>
          ) : (
            filtered.map((d) => (
              <div key={d.id} className={styles.card} onMouseEnter={() => setHoverId(d.id)} onMouseLeave={() => setHoverId((id) => (id === d.id ? null : id))}>
                <input className={styles.cardCheck} type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} />
                <div className={styles.cardHead}>
                  <i className="bx bxs-file-doc" style={{ color: "#a78bfa", fontSize: 26 }} />
                  <div className={styles.cardTitle}>{d.title}</div>
                </div>
                <div className={styles.cardMeta}>
                  <div style={{ fontSize: 12, opacity: 0.9 }}>Updated: {fmtDate(d.updatedAt)}</div>
                  {statusPill(d.status)}
                </div>
                <div className={styles.cardActions}>
                  <a href="/dashboard/documents" className={styles.linkBtn}>Continue</a>
                  <button onClick={() => deleteDraft(d.id)} className={styles.dangerBtn}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.length === 0 ? (
            <div className={styles.row}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div className={styles.rowTitle}>No drafts match your search</div>
                <div className={styles.rowSub}>Try different filters or create a new draft.</div>
              </div>
            </div>
          ) : (
            filtered.map((d) => (
              <div key={d.id} className={styles.row} onMouseEnter={() => setHoverId(d.id)} onMouseLeave={() => setHoverId((id) => (id === d.id ? null : id))}>
                <input type="checkbox" className={styles.rowCheck} checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} />
                <div style={{ overflow: "hidden" }}>
                  <div className={styles.rowTitle}>{d.title}</div>
                  <div className={styles.rowSub}>Updated: {fmtDate(d.updatedAt)}</div>
                </div>
                <div>{statusPill(d.status)}</div>
                <div className={styles.rowActions}>
                  <a href="/dashboard/documents" className={styles.linkBtn}>Continue</a>
                  <button onClick={() => deleteDraft(d.id)} className={styles.dangerBtn}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {selected.size > 0 && (
        <div className={styles.selectionBar}>
          <div className={styles.selectionInfo}>{selected.size} selected</div>
          <div className={styles.selectionActions}>
            <button className={styles.neutralBtn} onClick={() => markSelected("in-progress")}>Mark In Progress</button>
            <button className={styles.neutralBtn} onClick={() => markSelected("completed")}>Mark Completed</button>
            <button className={styles.dangerBtn} onClick={deleteSelected}>Delete Selected</button>
            <button className={styles.neutralBtn} onClick={clearSelection}>Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}
