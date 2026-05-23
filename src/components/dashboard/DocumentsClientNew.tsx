"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/database/supabase-browser";
import { getAppMarketFromPathname, getAppRouteForMarket } from "@/lib/markets/app-routes";
import styles from "./documents-page-new.module.css";
import DocumentsActionBar from "./documents/DocumentsActionBar";
import DocumentsFilters, { type FileTypeFilter } from "./documents/DocumentsFilters";
import DocumentsFolderModal from "./documents/DocumentsFolderModal";
import DocumentsHeader from "./documents/DocumentsHeader";
import DocumentsSidebar from "./documents/DocumentsSidebar";
import DocumentsTable from "./documents/DocumentsTable";
import DocumentsViewerModal from "./documents/DocumentsViewerModal";
import type { Document, Folder } from "./documents/types";
import { BUSINESS_CLEAR_DOCUMENTS_FILTER_EVENT } from "@/lib/events/business-events";

type DocumentsClientProps = {
  initialCanUpload?: boolean;
  initialPlanLoaded?: boolean;
  dashboardHrefOverride?: string;
  caseIdOverride?: string | null;
};

const DOCUMENTS_PAGE_SIZE = 100;

const mapApiDocument = (x: any, folderMap: Record<string, string>, folderOverride?: string): Document => ({
  id: x.id,
  title: x.name || 'Document',
  content: '',
  type: x.type || (x.mime_type ? x.mime_type.split('/')[1]?.toUpperCase() : 'Document'),
  createdAt: x.created_at || new Date().toISOString(),
  starred: Boolean(x.starred),
  size: x.file_size || 0,
  folderId: folderOverride || folderMap[x.id] || undefined,
  mimeType: x.mime_type || null,
  storagePath: x.storage_path || null,
  storageUrl: x.storage_url || null
});

export default function DocumentsClient({
  initialCanUpload = false,
  initialPlanLoaded = false,
  dashboardHrefOverride,
  caseIdOverride = null,
}: DocumentsClientProps) {
  const [activeFilter, setActiveFilter] = useState<'recents'|'starred'>('recents');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>('all');
  const [activeSection, setActiveSection] = useState<'home'|'myfiles'|'shared'|'recycle'>('home');
  const [activeFolder, setActiveFolder] = useState<string|null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [customFolders, setCustomFolders] = useState<Folder[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [uploadFolderId, setUploadFolderId] = useState<string>('');
  const [uid, setUid] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('You');
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const [viewingDocument, setViewingDocument] = useState<Document | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [documentsHasMore, setDocumentsHasMore] = useState(false);
  const [documentsNextOffset, setDocumentsNextOffset] = useState(0);
  const [documentsLoadingMore, setDocumentsLoadingMore] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{ kind: 'document' | 'folder'; id: string } | null>(null);
  const [canUpload, setCanUpload] = useState(Boolean(initialCanUpload));
  const [planLoaded, setPlanLoaded] = useState(Boolean(initialPlanLoaded));
  const [syncTargets, setSyncTargets] = useState<Array<{
    businessId: string
    businessName: string
    caseId: string
    matterId: string
    matterLabel: string
  }>>([]);
  const [selectedSyncTargetId, setSelectedSyncTargetId] = useState<string>('');
  const [selectedSyncIds, setSelectedSyncIds] = useState<string[]>([]);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string>('');
  const appMarket = getAppMarketFromPathname(pathname);
  const dashboardHref = dashboardHrefOverride || getAppRouteForMarket('/dashboard', appMarket);
  const documentsHref = getAppRouteForMarket('/dashboard/documents', appMarket);
  const caseIdFromOverride = typeof caseIdOverride === 'string' ? caseIdOverride.trim() : ''
  const caseId =
    (caseIdFromOverride ? caseIdFromOverride : null) ||
    (searchParams?.get?.('caseId') || '').trim() ||
    null;
  const caseIdIsOverride = Boolean(caseIdFromOverride);

  const readApiJson = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return await res.json();
    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return { error: 'Server returned an unexpected response. Please try again.' };
    }
    return { error: trimmed || 'Request failed' };
  };

  // Intentionally keyed by uid only; folder reassignment is handled in a separate effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null);
      const u = data?.user;
      if (u) {
        const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'You';
        setUserName(name);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null);
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || 'You';
        setUserName(name);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      if (!uid) return;
      try {
        const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await readApiJson(res);
        if (cancelled) return;
        setCanUpload(Boolean(data?.platformAccess ?? data?.paidAccess));
      } catch {
        // Keep preloaded value (or locked default) when plan refresh fails.
      } finally {
        if (!cancelled) {
          setPlanLoaded(true);
        }
      }
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    const loadSyncTargets = async () => {
      if (!uid) {
        setSyncTargets([]);
        setSelectedSyncTargetId('');
        return;
      }
      try {
        const res = await fetch('/api/client/document-sync', {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await readApiJson(res);
        if (!res.ok) return;
        const next = Array.isArray(data?.targets) ? data.targets : [];
        setSyncTargets(next);
        setSelectedSyncTargetId((prev) => prev || (next[0]?.businessId || ''));
      } catch {
        setSyncTargets([]);
      }
    };
    void loadSyncTargets();
  }, [uid]);

  useEffect(() => {
    try {
      const storedFolders = localStorage.getItem('documentFolders:v1');
      const storedMap = localStorage.getItem('documentFolderMap:v1');
      if (storedFolders) {
        setCustomFolders(JSON.parse(storedFolders));
      }
      if (storedMap) {
        setFolderMap(JSON.parse(storedMap));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('documentFolders:v1', JSON.stringify(customFolders));
    } catch (_) {}
  }, [customFolders]);

  useEffect(() => {
    try {
      localStorage.setItem('documentFolderMap:v1', JSON.stringify(folderMap));
    } catch (_) {}
  }, [folderMap]);

  useEffect(() => {
    if (activeFolder) setUploadFolderId(activeFolder);
  }, [activeFolder]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchDocuments = async () => {
      if (!uid) {
        setDocuments([]);
        setDocumentsHasMore(false);
        setDocumentsNextOffset(0);
        return;
      }
      try {
        const caseQuery = caseId ? `&caseId=${encodeURIComponent(caseId)}` : '';
        const res = await fetch(
          `/api/documents?limit=${DOCUMENTS_PAGE_SIZE}&offset=0${caseQuery}`,
          { credentials: 'include', signal: controller.signal }
        );
        const data: any = await readApiJson(res);
        if (!res.ok) throw new Error(data?.error || 'Failed to load documents');
        const mapped = (data.documents || []).map((x: any) => mapApiDocument(x, folderMap));
        setDocuments(mapped);
        setDocumentsHasMore(Boolean(data?.pagination?.hasMore));
        setDocumentsNextOffset(Number.isFinite(data?.pagination?.nextOffset) ? Number(data.pagination.nextOffset) : mapped.length);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to fetch documents', err);
      }
    };
    fetchDocuments();
    return () => controller.abort();
  }, [uid, caseId]);

  const loadMoreDocuments = async () => {
    if (!uid || documentsLoadingMore || !documentsHasMore) return;
    setDocumentsLoadingMore(true);
    try {
      const caseQuery = caseId ? `&caseId=${encodeURIComponent(caseId)}` : '';
      const res = await fetch(
        `/api/documents?limit=${DOCUMENTS_PAGE_SIZE}&offset=${documentsNextOffset}${caseQuery}`,
        { credentials: 'include' }
      );
      const data: any = await readApiJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load more documents');

      const mapped = (data.documents || []).map((x: any) => mapApiDocument(x, folderMap));
      setDocuments((prev) => {
        const seen = new Set(prev.map((doc) => doc.id));
        const deduped = mapped.filter((doc: Document) => !seen.has(doc.id));
        return [...prev, ...deduped];
      });
      setDocumentsHasMore(Boolean(data?.pagination?.hasMore));
      setDocumentsNextOffset(
        Number.isFinite(data?.pagination?.nextOffset)
          ? Number(data.pagination.nextOffset)
          : documentsNextOffset + mapped.length
      );
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to load more documents');
    } finally {
      setDocumentsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!documents.length) return;
    setDocuments(prev => {
      let changed = false;
      const next = prev.map(doc => {
        if (!(doc.id in folderMap)) return doc;
        const nextFolderId = folderMap[doc.id] || undefined;
        if (doc.folderId === nextFolderId) return doc;
        changed = true;
        return { ...doc, folderId: nextFolderId };
      });
      return changed ? next : prev;
    });
  }, [folderMap, documents.length]);

  useEffect(() => {
    const param = searchParams?.get?.('folder');
    if (param) setActiveFolder(param);
  }, [searchParams]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUpload) {
      setUploadError('Read-only mode: resume plan to upload documents. Existing documents remain safe.');
      e.target.value = '';
      return;
    }
    if (!e.target.files) return;
    setUploadError(null);
    setUploading(true);
    try {
      const files = Array.from(e.target.files);
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      if (caseId) formData.set('caseId', caseId);
      const targetFolderId = activeFolder || uploadFolderId || undefined;

      const res = await fetch('/api/documents', { method: 'POST', body: formData, credentials: 'include' });
      const data: any = await readApiJson(res);
      if (!res.ok) throw new Error(data?.error || 'Upload failed');
      const newDocs: Document[] = (data.documents || []).map((x: any)=> mapApiDocument(x, folderMap, targetFolderId));
      setDocuments(p=>[...newDocs,...p]);
      const mapFolderId = targetFolderId || '';
      if (mapFolderId) {
        setFolderMap(prev => {
          const next = { ...prev };
          newDocs.forEach(doc => { next[doc.id] = mapFolderId; });
          return next;
        });
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleFolderAssignment = (docId: string, folderId: string) => {
    setDocuments(p => p.map(d => d.id == docId ? { ...d, folderId: folderId || undefined } : d));
    setFolderMap(p => ({ ...p, [docId]: folderId }));
  };

  const clearCaseFilter = useCallback(() => {
    if (!caseId) return;
    if (caseIdIsOverride) {
      window.dispatchEvent(new CustomEvent(BUSINESS_CLEAR_DOCUMENTS_FILTER_EVENT));
      return;
    }
    try {
      const next = new URLSearchParams(searchParams?.toString?.() || '');
      next.delete('caseId');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    } catch {
      // ignore
    }
  }, [caseId, caseIdIsOverride, pathname, router, searchParams]);

  const toggleStar = async (id: string) => {
    const target = documents.find((d) => d.id === id);
    if (!target) return;
    const nextStarred = !Boolean(target.starred);

    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, starred: nextStarred } : d)));
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ starred: nextStarred }),
      });
      const data: any = await readApiJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to update star status');

      const confirmed = Boolean(data?.document?.starred);
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, starred: confirmed } : d)));
    } catch (err: any) {
      // Roll back optimistic change if persistence failed.
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, starred: !nextStarred } : d)));
      setUploadError(err?.message || 'Failed to update star status');
    }
  };

  const deleteDocument = async (id: string) => {
    if (!canUpload) {
      setUploadError('Read-only mode: resume plan to manage documents. Existing documents remain safe.');
      return;
    }
    setDeleteModal({ kind: 'document', id });
  };

  const confirmDeleteDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      const data: any = await readApiJson(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to delete document');
      setDocuments(p => p.filter(d => d.id !== id));
      setFolderMap(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to delete document');
    }
  };

  const deleteFolder = (folderId: string) => {
    setDeleteModal({ kind: 'folder', id: folderId });
  };

  const confirmDeleteFolder = (folderId: string) => {
    setCustomFolders(p => p.filter(f => f.id !== folderId));
    setDocuments(p => p.map(d => d.folderId === folderId ? { ...d, folderId: undefined } : d));
    setFolderMap(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(docId => {
        if (next[docId] === folderId) delete next[docId];
      });
      return next;
    });
    if (activeFolder === folderId) {
      setActiveFolder(null);
      try { router.replace(documentsHref); } catch(e){}
    }
  };

  const createFolder = () => {
    setShowFolderModal(true);
    setNewFolderName('');
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      const folder = { id: `folder-${Date.now()}`, name: newFolderName.trim() };
      setCustomFolders(p => [...p, folder]);
      setActiveFolder(folder.id);
      setUploadFolderId(folder.id);
      try { router.replace(getAppRouteForMarket(`/dashboard/documents?folder=${encodeURIComponent(folder.id)}`, appMarket)); } catch (_) {}
      setShowFolderModal(false);
      setNewFolderName('');
    }
  };

  // Summarize / analyse actions removed per product decision.

  const getPreviewKind = (doc: Document) => {
    const rawName = (doc.title || doc.type || '').trim();
    const normalizedName = rawName.split('?')[0].toLowerCase();
    const mime = (doc.mimeType || '').toLowerCase();

    if (
      mime.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|avif|heic|heif)$/.test(normalizedName)
    ) {
      return 'image';
    }
    if (mime.includes('pdf') || normalizedName.endsWith('.pdf')) return 'pdf';
    if (mime.includes('word') || normalizedName.endsWith('.docx')) return 'docx';
    if (mime.startsWith('text/') || /\.(txt|md|csv|json|log)$/.test(normalizedName)) return 'text';
    return 'file';
  };

  useEffect(() => {
    const loadPreview = async () => {
      if (!viewingDocument) return;
      setPreviewUrl(null);
      setPreviewText(null);
      setPreviewHtml(null);
      setPreviewError(null);

      if (viewingDocument.content) {
        setPreviewText(viewingDocument.content);
        return;
      }

      if (!viewingDocument.storagePath) {
        setPreviewError('No preview available.');
        return;
      }

      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/documents/${viewingDocument.id}/signed`, { credentials: 'include' });
        const data: any = await readApiJson(res);
        if (!res.ok || !data?.url) {
          throw new Error(data?.error || 'Unable to load preview');
        }
        const previewDoc: Document = {
          ...viewingDocument,
          mimeType: viewingDocument.mimeType || data?.mimeType || null,
          title: viewingDocument.title || data?.name || viewingDocument.title,
        };
        if ((previewDoc.mimeType && !viewingDocument.mimeType) || (data?.name && !viewingDocument.title)) {
          setViewingDocument(previewDoc);
        }
        setPreviewUrl(data.url);
        const kind = getPreviewKind(previewDoc);
        if (kind === 'text' || kind === 'docx') {
          const previewRes = await fetch(`/api/documents/${viewingDocument.id}/preview`, { credentials: 'include' });
          const previewData: any = await readApiJson(previewRes);
          if (kind === 'text' && previewData?.text) {
            setPreviewText(previewData.text);
            setDocuments(prev => prev.map(doc => doc.id === viewingDocument.id ? { ...doc, content: previewData.text } : doc));
          }
          if (kind === 'docx' && previewData?.html) {
            setPreviewHtml(previewData.html);
          }
        }
      } catch (err: any) {
        setPreviewError(err?.message || 'Unable to load preview');
      } finally {
        setPreviewLoading(false);
      }
    };
    loadPreview();
  }, [viewingDocument]);

  const folders = useMemo(() => [...customFolders], [customFolders]);

  const fmt = (d:string) => new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'2-digit'});
  const fmtSize = (b:number) => b>1048576?`${(b/1048576).toFixed(1)} MB`:b>0?`${(b/1024).toFixed(0)} KB`:'-';

  const extractIssues = (analysis: string) => {
    if (!analysis) return [];
    const match = analysis.match(/AREAS FOR ATTENTION:\s*([\s\S]*?)(?:\n[A-Z][A-Z\s\-]*:|$)/i);
    if (!match || !match[1]) return [];
    return match[1]
      .split(/\n+/)
      .map(line => line.replace(/^[-•\d\.\)\s]+/, '').trim())
      .filter(line => line.length > 0);
  };

  const sanitizePreviewHtml = (html: string) => {
    if (!html || typeof window === 'undefined') return html;

    const allowedTags = new Set([
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li',
      'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table',
      'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'a'
    ]);
    const allowedAttrsByTag: Record<string, Set<string>> = {
      a: new Set(['href', 'title']),
    };

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const elements = Array.from(doc.body.querySelectorAll('*'));

    for (const element of elements) {
      const tag = element.tagName.toLowerCase();
      if (!allowedTags.has(tag)) {
        const text = doc.createTextNode(element.textContent || '');
        element.replaceWith(text);
        continue;
      }

      const allowedAttrs = allowedAttrsByTag[tag] || new Set<string>();
      for (const attr of Array.from(element.attributes)) {
        const attrName = attr.name.toLowerCase();
        if (!allowedAttrs.has(attrName)) {
          element.removeAttribute(attr.name);
          continue;
        }

        if (tag === 'a' && attrName === 'href') {
          const href = attr.value.trim();
          const safeHref =
            href.startsWith('/') ||
            href.startsWith('#') ||
            /^https?:\/\//i.test(href) ||
            /^mailto:/i.test(href);

          if (!safeHref || /^javascript:/i.test(href) || /^data:/i.test(href)) {
            element.removeAttribute('href');
          } else {
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          }
        }
      }
    }

    return doc.body.innerHTML;
  };

  const buildHighlightedHtml = (html: string, issues: string[]) => {
    const safeHtml = sanitizePreviewHtml(html);
    if (!safeHtml || typeof window === 'undefined') return safeHtml;
    if (!issues.length) return safeHtml;
    const stopwords = new Set(['with', 'this', 'that', 'from', 'into', 'your', 'have', 'need', 'must', 'should', 'could', 'would', 'might', 'there', 'their', 'they', 'them', 'then', 'than']);
    const keywords = new Set<string>();
    issues.forEach(issue => {
      issue.toLowerCase().split(/[^a-z0-9]+/g).forEach(word => {
        if (word.length > 4 && !stopwords.has(word)) keywords.add(word);
      });
    });
    if (!keywords.size) return safeHtml;

    const parser = new DOMParser();
    const doc = parser.parseFromString(safeHtml, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const terms = Array.from(keywords).sort((a, b) => b.length - a.length);

    const wrapMatches = (textNode: Text) => {
      const text = textNode.nodeValue || '';
      let changed = false;
      const fragments: (string | HTMLElement)[] = [];
      let cursor = 0;

      while (cursor < text.length) {
        let foundIndex = -1;
        let foundTerm = '';
        for (const term of terms) {
          const idx = text.toLowerCase().indexOf(term, cursor);
          if (idx !== -1 && (foundIndex === -1 || idx < foundIndex)) {
            foundIndex = idx;
            foundTerm = term;
          }
        }
        if (foundIndex === -1) {
          fragments.push(text.slice(cursor));
          break;
        }
        if (foundIndex > cursor) {
          fragments.push(text.slice(cursor, foundIndex));
        }
        const span = doc.createElement('span');
        span.className = styles.issueHighlight;
        span.textContent = text.slice(foundIndex, foundIndex + foundTerm.length);
        fragments.push(span);
        cursor = foundIndex + foundTerm.length;
        changed = true;
      }

      if (!changed) return;
      const parent = textNode.parentNode;
      if (!parent) return;
      fragments.forEach(fragment => {
        if (typeof fragment === 'string') parent.insertBefore(doc.createTextNode(fragment), textNode);
        else parent.insertBefore(fragment, textNode);
      });
      parent.removeChild(textNode);
    };

    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        textNodes.push(current as Text);
      }
      current = walker.nextNode();
    }
    textNodes.forEach(node => wrapMatches(node));
    return doc.body.innerHTML;
  };

  const buildHighlights = (content: string, issues: string[]) => {
    if (!content) return [{ text: 'No preview available.', highlight: false }];
    if (!issues.length) return [{ text: content, highlight: false }];
    const stopwords = new Set(['with', 'this', 'that', 'from', 'into', 'your', 'have', 'need', 'must', 'should', 'could', 'would', 'might', 'there', 'their', 'they', 'them', 'then', 'than']);
    const keywords = new Set<string>();
    issues.forEach(issue => {
      issue.toLowerCase().split(/[^a-z0-9]+/g).forEach(word => {
        if (word.length > 4 && !stopwords.has(word)) keywords.add(word);
      });
    });
    const sentenceMatches = content.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [content];
    return sentenceMatches.map(sentence => {
      const lower = sentence.toLowerCase();
      const highlight = Array.from(keywords).some(word => lower.includes(word));
      return { text: sentence, highlight };
    });
  };

  const buildHighlightsFromRanges = (content: string, ranges: { start: number; end: number }[]) => {
    if (!content) return [{ text: 'No preview available.', highlight: false }];
    if (!ranges || ranges.length === 0) return [{ text: content, highlight: false }];
    const normalized = ranges
      .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end))
      .map(r => ({
        start: Math.max(0, Math.min(r.start, content.length)),
        end: Math.max(0, Math.min(r.end, content.length))
      }))
      .filter(r => r.end > r.start)
      .sort((a, b) => a.start - b.start);
    const parts: { text: string; highlight: boolean }[] = [];
    let cursor = 0;
    normalized.forEach(range => {
      if (range.start > cursor) {
        parts.push({ text: content.slice(cursor, range.start), highlight: false });
      }
      parts.push({ text: content.slice(range.start, range.end), highlight: true });
      cursor = range.end;
    });
    if (cursor < content.length) {
      parts.push({ text: content.slice(cursor), highlight: false });
    }
    return parts;
  };

  const items = useMemo(() => {
    let arr = [...documents];
    if (activeFilter === 'starred') arr = arr.filter(d => d.starred);
    if (activeFolder) arr = arr.filter(d => d.folderId === activeFolder);
    if (fileTypeFilter !== 'all') {
      arr = arr.filter(doc => {
        const name = (doc.title || '').toLowerCase();
        const mime = (doc.mimeType || '').toLowerCase();
        switch (fileTypeFilter) {
          case 'word': return mime.includes('word') || name.endsWith('.doc') || name.endsWith('.docx');
          case 'excel': return mime.includes('excel') || mime.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');
          case 'powerpoint': return mime.includes('powerpoint') || mime.includes('presentation') || name.endsWith('.pptx') || name.endsWith('.ppt');
          case 'pdf': return mime.includes('pdf') || name.endsWith('.pdf');
          case 'image': return mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name);
          default: return true;
        }
      });
    }
    if (searchQuery) arr = arr.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [documents, activeFilter, activeFolder, fileTypeFilter, searchQuery]);

  const totalDocs = documents.length;
  const starredDocs = documents.filter(d => d.starred).length;
  const totalBytes = documents.reduce((acc, doc) => acc + (doc.size || 0), 0);
  const activeFolderName = activeFolder ? folders.find(f => f.id === activeFolder)?.name : 'All files';
  const storageLabel = fmtSize(totalBytes);
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach(doc => {
      if (!doc.folderId) return;
      counts[doc.folderId] = (counts[doc.folderId] || 0) + 1;
    });
    return counts;
  }, [documents]);

  const handleSelectAllFolders = () => {
    setActiveFolder(null);
    try { router.replace(documentsHref); } catch (_) {}
  };

  const handleSelectFolder = (folderId: string) => {
    setActiveFolder(folderId);
    try { router.replace(getAppRouteForMarket(`/dashboard/documents?folder=${encodeURIComponent(folderId)}`, appMarket)); } catch (_) {}
  };

  const handleViewDocument = (doc: Document) => {
    setViewingDocument(doc);
  };

  const handleDownloadDocument = async (doc: Document) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/signed`, { credentials: 'include' });
      const data: any = await readApiJson(res);
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || 'Unable to prepare download');
      }

      const anchor = document.createElement('a');
      anchor.href = data.url;
      anchor.download = doc.title || 'document';
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to download document');
    }
  };

  const toggleSyncSelect = (id: string) => {
    setSelectedSyncIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllVisible = () => {
    setSelectedSyncIds(items.map((doc) => doc.id));
  };

  const clearSelectedVisible = () => {
    setSelectedSyncIds([]);
  };

  const syncSelectedDocuments = async () => {
    if (!selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy) return;
    setSyncBusy(true);
    setSyncNotice('');
    try {
      const res = await fetch('/api/client/document-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          businessId: selectedSyncTargetId,
          documentIds: selectedSyncIds,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data?.message || 'Document sync failed.');
      const syncedCount = Number(data?.syncedCount || 0);
      const skippedCount = Number(data?.skippedCount || 0);
      setSyncNotice(
        `Synced ${syncedCount} document${syncedCount === 1 ? '' : 's'} to your professional. ${skippedCount > 0 ? `${skippedCount} already existed and were skipped.` : ''}`.trim(),
      );
      setSelectedSyncIds([]);
    } catch (err: any) {
      setSyncNotice(err?.message || 'Document sync failed.');
    } finally {
      setSyncBusy(false);
    }
  };

  const removeSelectedSharedDocuments = async () => {
    if (!selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy) return;
    setSyncBusy(true);
    setSyncNotice('');
    try {
      const res = await fetch('/api/client/document-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          mode: 'remove',
          businessId: selectedSyncTargetId,
          documentIds: selectedSyncIds,
        }),
      });
      const data = await readApiJson(res);
      if (!res.ok) throw new Error(data?.message || 'Failed to remove shared copies.');
      setSyncNotice('Removed shared copies for selected documents from the professional matter.');
      setSelectedSyncIds([]);
    } catch (err: any) {
      setSyncNotice(err?.message || 'Failed to remove shared copies.');
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        hidden
        onChange={handleUpload}
        disabled={!canUpload || uploading}
      />
      <DocumentsSidebar
        folders={folders}
        activeFolderId={activeFolder}
        activeSection={activeSection}
        onSelectAll={handleSelectAllFolders}
        onSelectFolder={handleSelectFolder}
        onDeleteFolder={deleteFolder}
        onCreateFolder={createFolder}
        onSelectSection={setActiveSection}
        canUpload={canUpload}
        userName={userName}
        onUploadTrigger={() => uploadInputRef.current?.click()}
      />

      {/* Main Content */}
      <main className={styles.mainContent}>
        <DocumentsHeader
          title={activeFolderName || 'All files'}
          totalDocs={totalDocs}
          starredDocs={starredDocs}
        />
        {caseId && (
          <div className={styles.caseFilterBar} role="status" aria-live="polite">
            <div className={styles.caseFilterText}>
              <span className={styles.caseFilterLabel}>Matter filter</span>
              <span className={styles.caseFilterValue}>Showing files linked to the selected client matter.</span>
            </div>
            <button type="button" className={styles.caseFilterClearBtn} onClick={clearCaseFilter}>
              Clear
            </button>
          </div>
        )}

        <DocumentsActionBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          folders={folders}
          uploadFolderId={uploadFolderId}
          onUploadFolderChange={setUploadFolderId}
          uploading={uploading}
          canUpload={canUpload}
          onUpload={handleUpload}
          onCreateFolder={createFolder}
        />
        {!canUpload && planLoaded && (
          <p className={styles.readOnlyNotice}>
            Read-only mode: viewing and downloading are available. Resume plan to upload or delete documents.
          </p>
        )}
        {uploadError && (
          <p style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: '-8px' }}>{uploadError}</p>
        )}
        {syncTargets.length > 0 && (
          <section
            style={{
              marginTop: '10px',
              marginBottom: '8px',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: '12px',
              padding: '12px',
              background: '#f8faff',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <strong style={{ color: '#1e1b4b' }}>Share selected documents with professional</strong>
              <select
                value={selectedSyncTargetId}
                onChange={(e) => setSelectedSyncTargetId(e.target.value)}
                style={{ border: '1px solid #c7d2fe', borderRadius: 8, padding: '6px 10px' }}
              >
                {syncTargets.map((target) => (
                  <option key={target.businessId} value={target.businessId}>
                    {target.businessName} - {target.matterLabel}
                  </option>
                ))}
              </select>
              <button type="button" onClick={selectAllVisible} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
                Select visible
              </button>
              <button type="button" onClick={clearSelectedVisible} style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>
                Clear
              </button>
              <button
                type="button"
                onClick={() => void syncSelectedDocuments()}
                disabled={!selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy}
                style={{
                  border: 'none',
                  borderRadius: 8,
                  padding: '7px 12px',
                  background: '#4f46e5',
                  color: '#fff',
                  opacity: !selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy ? 0.6 : 1,
                  cursor: !selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy ? 'not-allowed' : 'pointer',
                }}
              >
                {syncBusy ? 'Syncing...' : `Sync selected (${selectedSyncIds.length})`}
              </button>
              <button
                type="button"
                onClick={() => void removeSelectedSharedDocuments()}
                disabled={!selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy}
                style={{
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '7px 12px',
                  background: '#fff1f2',
                  color: '#b91c1c',
                  opacity: !selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy ? 0.6 : 1,
                  cursor: !selectedSyncTargetId || selectedSyncIds.length === 0 || syncBusy ? 'not-allowed' : 'pointer',
                }}
              >
                Remove shared copies
              </button>
            </div>
            <p style={{ marginTop: 8, color: '#475569', fontSize: '0.85rem' }}>
              Selected files will appear in your professional’s client case documents.
            </p>
            {syncNotice && (
              <p style={{ marginTop: 6, color: syncNotice.toLowerCase().includes('failed') ? '#b91c1c' : '#166534', fontSize: '0.85rem' }}>
                {syncNotice}
              </p>
            )}
          </section>
        )}

        <DocumentsFilters
          activeFilter={activeFilter}
          fileTypeFilter={fileTypeFilter}
          onFilterChange={setActiveFilter}
          onFileTypeChange={setFileTypeFilter}
        />

        {!activeFolder && activeFilter === 'recents' && folders.length > 0 && (
          <section className={styles.folderTilesSection} aria-label="Folders">
            <div className={styles.sectionHeader}>
              <h2>Folders</h2>
              <span>{folders.length} folder{folders.length === 1 ? '' : 's'}</span>
            </div>
            <div className={styles.folderTiles}>
              {folders.map(folder => (
                <button
                  key={folder.id}
                  type="button"
                  className={styles.folderTile}
                  onClick={() => handleSelectFolder(folder.id)}
                >
                  <span className={styles.folderTileIcon}><i className="bx bxs-folder"></i></span>
                  <span className={styles.folderTileText}>
                    <strong>{folder.name}</strong>
                    <small>{folderCounts[folder.id] || 0} file{(folderCounts[folder.id] || 0) === 1 ? '' : 's'}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* File List */}
        <div className={styles.fileListContainer}>
          {items.length === 0 ? (
            <div className={styles.emptyState}>
              <i className="bx bx-folder-open"></i>
              <h3>{activeFilter === 'starred' ? 'No starred files' : activeFolder ? 'No files in this folder' : 'No files yet'}</h3>
              <p>Upload documents to get started</p>
            </div>
          ) : (
            <>
              <DocumentsTable
                items={items}
                folders={folders}
                formatDate={fmt}
                formatSize={fmtSize}
                onView={handleViewDocument}
                onDownload={handleDownloadDocument}
                onToggleStar={toggleStar}
                canDelete={canUpload}
                onDelete={deleteDocument}
                onFolderChange={handleFolderAssignment}
                userName={userName}
                selectable={syncTargets.length > 0}
                selectedIds={selectedSyncIds}
                onToggleSelect={toggleSyncSelect}
              />
              {documentsHasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 4px' }}>
                  <button
                    type="button"
                    style={{
                      border: '1px solid rgba(15,23,42,0.16)',
                      borderRadius: '10px',
                      background: '#fff',
                      color: '#0f172a',
                      padding: '8px 14px',
                      fontWeight: 600,
                      cursor: documentsLoadingMore ? 'not-allowed' : 'pointer',
                      opacity: documentsLoadingMore ? 0.75 : 1,
                    }}
                    onClick={() => void loadMoreDocuments()}
                    disabled={documentsLoadingMore}
                  >
                    {documentsLoadingMore ? 'Loading...' : 'Load more documents'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <DocumentsViewerModal
        document={viewingDocument}
        formatDate={fmt}
        previewLoading={previewLoading}
        previewError={previewError}
        previewText={previewText}
        previewHtml={previewHtml}
        previewUrl={previewUrl}
        buildHighlights={buildHighlights}
        buildHighlightsFromRanges={buildHighlightsFromRanges}
        buildHighlightedHtml={buildHighlightedHtml}
        extractIssues={extractIssues}
        getPreviewKind={getPreviewKind}
        onClose={() => setViewingDocument(null)}
      />

      <DocumentsFolderModal
        open={showFolderModal}
        folderName={newFolderName}
        onFolderNameChange={setNewFolderName}
        onClose={() => setShowFolderModal(false)}
        onCreate={handleCreateFolder}
      />

      {deleteModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>
              {deleteModal.kind === 'document' ? 'Delete this document?' : 'Delete this folder?'}
            </h3>
            <p className={styles.modalBody}>
              {deleteModal.kind === 'document'
                ? 'This action cannot be undone.'
                : 'This will remove the folder. Documents remain available in All Documents.'}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalButtonSecondary}
                onClick={() => setDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalButtonDanger}
                onClick={() => {
                  const target = deleteModal;
                  setDeleteModal(null);
                  if (target.kind === 'document') {
                    void confirmDeleteDocument(target.id);
                    return;
                  }
                  confirmDeleteFolder(target.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
