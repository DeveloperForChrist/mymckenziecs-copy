"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";
import styles from "./checklist-page.module.css";

type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type ChecklistState = {
  documents: ChecklistItem[];
  procedural: ChecklistItem[];
  actions: ChecklistItem[];
};

const emptyChecklist: ChecklistState = {
  documents: [],
  procedural: [],
  actions: [],
};

const makeId = () => `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function ChecklistPageClient() {
  const [uid, setUid] = useState<string | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string>("");
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistState>(emptyChecklist);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string>("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("selectedCaseId") : null;
    if (stored) setActiveCaseId(stored);
  }, []);

  useEffect(() => {
    if (!uid) {
      setCases([]);
      return;
    }
    const fetchCases = async () => {
      try {
        const res = await fetch('/api/cases');
        const data = await res.json();
        const list = Array.isArray(data.cases) ? data.cases : [];
        setCases(list);
        if (!activeCaseId && list.length > 0) {
          setActiveCaseId(list[0].id);
          localStorage.setItem("selectedCaseId", list[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch cases", err);
      }
    };
    fetchCases();
  }, [uid, activeCaseId]);

  const activeCase = useMemo(
    () => cases.find((c) => c.id === activeCaseId) || null,
    [cases, activeCaseId]
  );

  const buildDefaultChecklist = async () => {
    const base: ChecklistState = {
      documents: [
        { id: makeId(), text: "Upload key documents and evidence", done: false },
        { id: makeId(), text: "Organize documents by category or folder", done: false },
      ],
      procedural: [
        { id: makeId(), text: "Confirm key dates and deadlines", done: false },
        { id: makeId(), text: "Add hearings or court dates to MyCalendar", done: false },
      ],
      actions: [
        { id: makeId(), text: "Summarise the case facts and goals", done: false },
        { id: makeId(), text: "List next steps and responsibilities", done: false },
      ],
    };

    if (!uid || !activeCaseId) return base;
    try {
      const res = await fetch("/api/documents", { credentials: "include" });
      const data = await res.json();
      const docs = Array.isArray(data.documents) ? data.documents : [];
      const caseDocs = docs.filter((d: any) => d.case_id === activeCaseId);
      if (caseDocs.length > 0) {
        base.documents.unshift({
          id: makeId(),
          text: `Review ${caseDocs.length} uploaded document${caseDocs.length === 1 ? "" : "s"}`,
          done: false,
        });
      }
    } catch (_) {}
    if (activeCase?.description) {
      base.actions.unshift({
        id: makeId(),
        text: "Review the case summary and update any missing details",
        done: false,
      });
    }
    return base;
  };

  useEffect(() => {
    const loadChecklist = async () => {
      if (!uid || !activeCaseId) {
        setChecklist(emptyChecklist);
        return;
      }
      setLoadingChecklist(true);
      try {
        if (!activeCase) {
          setChecklist(emptyChecklist);
          setLoadingChecklist(false);
          return;
        }
        const existing: ChecklistState = {
          documents: Array.isArray(activeCase.checklist_documents) ? activeCase.checklist_documents : [],
          procedural: Array.isArray(activeCase.checklist_procedural) ? activeCase.checklist_procedural : [],
          actions: Array.isArray(activeCase.checklist_actions) ? activeCase.checklist_actions : [],
        };
        const hasAny =
          existing.documents.length || existing.procedural.length || existing.actions.length;
        if (hasAny) {
          setChecklist(existing);
          lastSavedRef.current = JSON.stringify(existing);
        } else {
          const defaults = await buildDefaultChecklist();
          setChecklist(defaults);
          lastSavedRef.current = JSON.stringify(defaults);
        }

        const lastAuto = activeCase.checklist_auto_generated_at
          ? new Date(activeCase.checklist_auto_generated_at).getTime()
          : 0;
        const hoursSince = lastAuto ? (Date.now() - lastAuto) / (1000 * 60 * 60) : Infinity;
        if (hoursSince >= 6) {
          const autoRes = await fetch('/api/checklist/auto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: activeCaseId }),
          });
          const autoData = await autoRes.json();
          if (autoRes.ok && autoData?.checklist) {
            setChecklist(autoData.checklist);
            lastSavedRef.current = JSON.stringify(autoData.checklist);
          }
        }
      } finally {
        setLoadingChecklist(false);
      }
    };
    loadChecklist();
  }, [uid, activeCaseId, activeCase]);

  useEffect(() => {
    if (!uid || !activeCaseId) return;
    const payload = JSON.stringify(checklist);
    if (payload === lastSavedRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveState("saving");
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch("/api/cases", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseId: activeCaseId,
            updates: {
              checklist_documents: checklist.documents,
              checklist_procedural: checklist.procedural,
              checklist_actions: checklist.actions,
              checklist_updated_at: new Date().toISOString(),
            },
          }),
        });
        lastSavedRef.current = payload;
        setSaveState("saved");
      } catch (err) {
        console.error("Failed to save checklist", err);
        setSaveState("error");
      }
    }, 600);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [uid, activeCaseId, checklist]);

  const updateItem = (section: keyof ChecklistState, id: string, updates: Partial<ChecklistItem>) => {
    setChecklist((prev) => ({
      ...prev,
      [section]: prev[section].map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  };

  const addItem = (section: keyof ChecklistState) => {
    setChecklist((prev) => ({
      ...prev,
      [section]: [{ id: makeId(), text: "New item", done: false }, ...prev[section]],
    }));
  };

  const deleteItem = (section: keyof ChecklistState, id: string) => {
    setChecklist((prev) => ({
      ...prev,
      [section]: prev[section].filter((item) => item.id !== id),
    }));
  };

  const clearCompleted = (section: keyof ChecklistState) => {
    setChecklist((prev) => ({
      ...prev,
      [section]: prev[section].filter((item) => !item.done),
    }));
  };

  const resetToSuggested = async () => {
    const defaults = await buildDefaultChecklist();
    setChecklist(defaults);
  };

  const sectionMeta: Record<keyof ChecklistState, { title: string; description: string; className: string }> = {
    documents: {
      title: "Documents",
      description: "Evidence and records to keep organised.",
      className: styles.cardDocuments,
    },
    procedural: {
      title: "Procedural",
      description: "Deadlines, filings, and court steps.",
      className: styles.cardProcedural,
    },
    actions: {
      title: "Actions",
      description: "Practical steps to move the matter forward.",
      className: styles.cardActionsSection,
    },
  };

  if (!uid) {
    return (
      <div className={styles.emptyState}>
        <h2>MyChecklist</h2>
        <p>Please sign in to manage your case checklist.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>MyChecklist</h1>
          <p>Personalised checklists based on your active case profile.</p>
        </div>
        <div className={styles.headerActions}>
          {cases.length > 0 && activeCase && (
            <div className={styles.caseSelectWrap}>
              <label>Active case</label>
              <div>{activeCase.title || "Untitled case"}</div>
            </div>
          )}
          <button className={styles.secondaryBtn} onClick={resetToSuggested}>
            Reset to suggested
          </button>
        </div>
      </header>

      <div className={styles.saveState}>
        {loadingChecklist ? "Loading checklist…" : saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
      </div>

      <div className={styles.grid}>
        {(["documents", "procedural", "actions"] as Array<keyof ChecklistState>).map((section) => {
          const meta = sectionMeta[section];
          return (
          <section key={section} className={`${styles.card} ${meta.className}`}>
            <div className={styles.cardHeader}>
              <div>
                <h2>{meta.title}</h2>
                <p>{meta.description}</p>
              </div>
              <div className={styles.cardActions}>
                <button className={styles.ghostBtn} onClick={() => addItem(section)}>
                  Add item
                </button>
                <button className={styles.ghostBtn} onClick={() => clearCompleted(section)}>
                  Clear done
                </button>
              </div>
            </div>
            <div className={styles.list}>
              {checklist[section].length === 0 ? (
                <div className={styles.emptyList}>No items yet.</div>
              ) : (
                checklist[section].map((item) => (
                  <div key={item.id} className={styles.listItem}>
                    <div className={styles.itemHeader}>
                      <label className={styles.itemCheck}>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => updateItem(section, item.id, { done: !item.done })}
                        />
                        <span />
                      </label>
                      <button className={styles.deleteBtn} onClick={() => deleteItem(section, item.id)}>
                        Remove
                      </button>
                    </div>
                    <textarea
                      className={styles.itemInput}
                      rows={3}
                      value={item.text}
                      onChange={(e) => updateItem(section, item.id, { text: e.target.value })}
                    />
                  </div>
                ))
              )}
            </div>
          </section>
        )})}
      </div>
    </div>
  );
}
