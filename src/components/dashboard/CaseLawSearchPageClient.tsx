'use client';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { Search, Filter, ExternalLink, Scale, Calendar, Building2, Lock, BookOpen, Loader2, ChevronLeft, ChevronRight, MessageCircle, Send } from 'lucide-react';
import { hasCaseLawAccess } from '@/lib/plans/access';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';
import { getPublicRouteForMarket, normalizePublicMarket, type PublicMarket } from '@/lib/markets/public-routes';

interface CaseLawResult {
  id: string;
  citation: string;
  title: string;
  url?: string;
  summary?: string;
  extracts?: string[];
  case_type: string;
  year?: number;
  court?: string;
  outcome?: string;
  similarity: number;
}

interface PaginatedCaseStudyChunk {
  content: string;
  page?: number;
}

interface SearchFilters {
  case_type: string;
  year_from?: number;
  year_to?: number;
  court?: string;
  outcome?: string;
}

interface SearchHistoryItem {
  query: string;
  searchedAt: string;
  resultsCount: number;
}

interface ViewedCaseHistoryItem {
  id: string;
  citation: string;
  title: string;
  court?: string;
  year?: number;
  viewedAt: string;
  case_type?: string;
  summary?: string;
  similarity: number;
  outcome?: string;
  url?: string;
  extracts?: string[];
}

const SEARCH_HISTORY_KEY = 'case-law-search-history:v1';
const VIEWED_HISTORY_KEY = 'case-law-viewed-history:v1';
const SEARCH_HISTORY_LIMIT = 10;
const VIEWED_HISTORY_LIMIT = 12;
const HISTORY_SYNC_DELAY_MS = 500;

const toIsoOrNow = (value: any): string => {
  if (typeof value !== 'string') return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeSearchHistoryItems = (value: any): SearchHistoryItem[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, any>;
      if (typeof raw.query !== 'string') return null;
      const query = raw.query.trim();
      if (!query) return null;
      return {
        query,
        searchedAt: toIsoOrNow(raw.searchedAt),
        resultsCount: Number.isFinite(raw.resultsCount) ? Math.max(0, Math.floor(Number(raw.resultsCount))) : 0,
      };
    })
    .filter((item): item is SearchHistoryItem => Boolean(item))
    .sort((a, b) => new Date(b.searchedAt).getTime() - new Date(a.searchedAt).getTime());

  const deduped: SearchHistoryItem[] = [];
  const seen = new Set<string>();
  for (const item of normalized) {
    const key = item.query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= SEARCH_HISTORY_LIMIT) break;
  }
  return deduped;
};

const normalizeViewedHistoryItems = (value: any): ViewedCaseHistoryItem[] => {
  if (!Array.isArray(value)) return [];
  const normalized: ViewedCaseHistoryItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, any>;
    if (typeof raw.id !== 'string' || typeof raw.citation !== 'string' || typeof raw.title !== 'string') continue;
    const id = raw.id.trim();
    const citation = raw.citation.trim();
    const title = raw.title.trim();
    if (!id || !citation || !title) continue;

    const normalizedItem: ViewedCaseHistoryItem = {
      id,
      citation,
      title,
      viewedAt: toIsoOrNow(raw.viewedAt),
      similarity: Number.isFinite(raw.similarity) ? Number(raw.similarity) : 0,
    };
    if (typeof raw.court === 'string') normalizedItem.court = raw.court;
    if (Number.isFinite(raw.year)) normalizedItem.year = Math.floor(Number(raw.year));
    if (typeof raw.case_type === 'string') normalizedItem.case_type = raw.case_type;
    if (typeof raw.summary === 'string') normalizedItem.summary = raw.summary;
    if (typeof raw.outcome === 'string') normalizedItem.outcome = raw.outcome;
    if (typeof raw.url === 'string') normalizedItem.url = raw.url;
    if (Array.isArray(raw.extracts)) {
      normalizedItem.extracts = raw.extracts.filter((extract): extract is string => typeof extract === 'string');
    }
    normalized.push(normalizedItem);
  }

  normalized.sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());

  const deduped: ViewedCaseHistoryItem[] = [];
  const seen = new Set<string>();
  for (const item of normalized) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
    if (deduped.length >= VIEWED_HISTORY_LIMIT) break;
  }
  return deduped;
};

const normalizeExtracts = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(/\n{2,}|\n-+|•|\r\n/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [];
};

const formatStudyContent = (content: string): Array<{ text: string; kind: 'heading' | 'paragraph' | 'bullet' }> => {
  const headingLabels = [
    'CASE SUMMARY',
    'BACKGROUND AND CONTEXT',
    'CASE OVERVIEW',
    'LEGAL PRINCIPLES EXPLAINED',
    'PARTY ANALYSIS - CLAIMANT/PETITIONER',
    'PARTY ANALYSIS - DEFENDANT/RESPONDENT',
    "COURT'S REASONING",
    'LEARNING POINTS FOR LITIGANTS IN PERSON',
    'BROADER IMPLICATIONS'
  ];

  const headingMatcher = new RegExp(`(${headingLabels.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const sanitizeInlineMarkdown = (text: string) =>
    text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\s+\d+\.$/, '')
      .trim();

  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(headingMatcher, '\n\n$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const chunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const parsed: Array<{ text: string; kind: 'heading' | 'paragraph' | 'bullet' }> = [];

  const splitLongParagraph = (text: string) => {
    const sentenceBoundary =
      /(?<=[.!?])\s+(?=(?!Ltd\b|Limited\b|PLC\b|LLP\b|Inc\b|Corp\b|Co\b|No\b|Mr\b|Mrs\b|Ms\b|Dr\b)[A-Z][a-z]{2,})/g;
    const sentences = text
      .split(sentenceBoundary)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length <= 3) return [text.trim()];
    const grouped: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      grouped.push(sentences.slice(i, i + 2).join(' '));
    }
    return grouped;
  };

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => sanitizeInlineMarkdown(line))
      .filter(Boolean);
    if (lines.length === 0) continue;

    // Skip orphan numbering lines like "6." that can appear before headings.
    if (lines.length === 1 && /^\d+\.$/.test(lines[0])) {
      continue;
    }

    const firstLine = lines[0];

    if (/^(\d+\.\s+[A-Z][A-Za-z0-9\s\-()']{2,}|[A-Z][A-Z\s\-()']{3,})$/.test(firstLine)) {
      parsed.push({ text: firstLine, kind: 'heading' });
      const body = lines.slice(1).join(' ').trim();
      if (body) {
        for (const p of splitLongParagraph(body)) {
          parsed.push({ text: p, kind: 'paragraph' });
        }
      }
      continue;
    }

    const inlineHeading = firstLine.match(/^(\d+\.\s+[A-Z][A-Za-z0-9\s\-()']{2,}|[A-Z][A-Z\s\-()']{3,})\s+(.+)$/);
    if (inlineHeading) {
      parsed.push({ text: inlineHeading[1], kind: 'heading' });
      const inlineBody = `${inlineHeading[2]} ${lines.slice(1).join(' ')}`.trim();
      for (const p of splitLongParagraph(inlineBody)) {
        parsed.push({ text: p, kind: 'paragraph' });
      }
      continue;
    }

    // Handle markdown-style numbered headings like:
    // 1. **Heading Text** - explanation...
    const markdownHeading = firstLine.match(/^(\d+)\.\s+(.+?)\s*-\s*(.+)$/);
    if (markdownHeading) {
      const headingText = sanitizeInlineMarkdown(markdownHeading[2]).replace(/[:\-–—]\s*$/, '');
      const explanation = sanitizeInlineMarkdown(
        `${markdownHeading[3]} ${lines.slice(1).join(' ')}`
      );
      if (headingText) {
        parsed.push({ text: headingText, kind: 'heading' });
      }
      if (explanation) {
        for (const p of splitLongParagraph(explanation)) {
          parsed.push({ text: p, kind: 'paragraph' });
        }
      }
      continue;
    }

    for (const line of lines) {
      if (/^[-•]\s+/.test(line)) {
        parsed.push({ text: sanitizeInlineMarkdown(line.replace(/^[-•]\s+/, '')), kind: 'bullet' });
      } else {
        for (const p of splitLongParagraph(sanitizeInlineMarkdown(line))) {
          parsed.push({ text: p, kind: 'paragraph' });
        }
      }
    }
  }

  return parsed;
};

const groupStudySections = (
  lines: Array<{ text: string; kind: 'heading' | 'paragraph' | 'bullet' }>
): Array<{ heading: string | null; items: Array<{ text: string; kind: 'paragraph' | 'bullet' }> }> => {
  const sections: Array<{ heading: string | null; items: Array<{ text: string; kind: 'paragraph' | 'bullet' }> }> = [];
  let current: { heading: string | null; items: Array<{ text: string; kind: 'paragraph' | 'bullet' }> } = {
    heading: null,
    items: []
  };

  for (const line of lines) {
    if (line.kind === 'heading') {
      const cleanHeading = line.text.replace(/^\d+\.\s*/, '').trim();
      if (!cleanHeading) continue;
      if (current.heading || current.items.length) {
        sections.push(current);
      }
      current = { heading: cleanHeading, items: [] };
      continue;
    }
    current.items.push({ text: line.text, kind: line.kind });
  }

  if (current.heading || current.items.length) {
    sections.push(current);
  }

  return sections;
};

type CaseLawSearchPageClientProps = {
  initialUserPlan?: string;
  initialHasPaidAccess?: boolean;
  initialPlanChecked?: boolean;
  initialPublicMarket?: PublicMarket;
  dashboardHrefOverride?: string;
  settingsHrefOverride?: string;
  forceAccess?: boolean;
  embedded?: boolean;
};

export default function CaseLawSearchPageClient({
  initialUserPlan = 'guest',
  initialHasPaidAccess = false,
  initialPlanChecked = false,
  initialPublicMarket = 'GB',
  dashboardHrefOverride,
  settingsHrefOverride,
  forceAccess = false,
  embedded = false,
}: CaseLawSearchPageClientProps = {}) {
  const workspaceMaxWidth = 'var(--app-shell-max-width, 1720px)';
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const isDarkMode = theme === 'dark';
  const pageShellStyle: CSSProperties = {
    background: isDarkMode ? '#111111' : '#270427',
    height: embedded ? '100%' : '100vh',
    minHeight: 0,
    width: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    padding: 'clamp(12px, 3vw, 24px)',
  };
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CaseLawResult[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [viewedHistory, setViewedHistory] = useState<ViewedCaseHistoryItem[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseLawResult | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    case_type: 'all',
  });
  const [userPlan, setUserPlan] = useState<string>(initialUserPlan);
  const [hasPaidAccess, setHasPaidAccess] = useState(Boolean(initialHasPaidAccess));

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const readTheme = () => {
      const nextTheme = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      setTheme((current) => (current === nextTheme ? current : nextTheme));
    };

    readTheme();

    const observer = new MutationObserver(readTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  const [planChecked, setPlanChecked] = useState(Boolean(initialPlanChecked));
  const [publicMarket, setPublicMarket] = useState<PublicMarket>(initialPublicMarket);
  const [studyingCase, setStudyingCase] = useState<string | null>(null);
  const [caseStudy, setCaseStudy] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studyCaseMeta, setStudyCaseMeta] = useState<CaseLawResult | null>(null);
  const [studyChatInput, setStudyChatInput] = useState('');
  const [studyChatMessages, setStudyChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [studyChatLoading, setStudyChatLoading] = useState(false);
  const [studyChatError, setStudyChatError] = useState<string | null>(null);
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [searchErrorModal, setSearchErrorModal] = useState<string | null>(null);
  const [paginatedContent, setPaginatedContent] = useState<PaginatedCaseStudyChunk[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const dashboardHref = dashboardHrefOverride || getAppRouteForMarket('/dashboard', normalizePublicMarket(publicMarket));
  const settingsHref = settingsHrefOverride || getAppRouteForMarket('/settings', normalizePublicMarket(publicMarket));
  const searchAbortRef = useRef<AbortController | null>(null);
  const historySyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchRequestSeqRef = useRef(0);
  const currentStudyPageContent = paginatedContent[currentPage - 1]?.content || caseStudy || '';
  const formattedStudyContent = formatStudyContent(currentStudyPageContent);
  const studySections = groupStudySections(formattedStudyContent);

  // Check user's plan on component mount
  useEffect(() => {
    const checkUserPlan = async () => {
      try {
        const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        setUserPlan((data?.plan || 'guest').toString());
        setHasPaidAccess(forceAccess ? true : Boolean(data?.paidAccess));
        setPublicMarket(normalizePublicMarket(data?.publicMarket));
      } catch (error) {
        console.error('Error checking user plan:', error);
      } finally {
        setPlanChecked(true);
      }
    };

    checkUserPlan();
  }, [forceAccess]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (typeof window === 'undefined') {
        setHistoryHydrated(true);
        return;
      }

      let localSearchHistory: SearchHistoryItem[] = [];
      let localViewedHistory: ViewedCaseHistoryItem[] = [];

      try {
        const rawSearchHistory = window.localStorage.getItem(SEARCH_HISTORY_KEY);
        localSearchHistory = normalizeSearchHistoryItems(rawSearchHistory ? JSON.parse(rawSearchHistory) : []);
      } catch (error) {
        console.error('Failed to load case law search history', error);
      }

      try {
        const rawViewedHistory = window.localStorage.getItem(VIEWED_HISTORY_KEY);
        localViewedHistory = normalizeViewedHistoryItems(rawViewedHistory ? JSON.parse(rawViewedHistory) : []);
      } catch (error) {
        console.error('Failed to load viewed case law history', error);
      }

      let serverSearchHistory: SearchHistoryItem[] = [];
      let serverViewedHistory: ViewedCaseHistoryItem[] = [];
      try {
        const response = await fetch('/api/case-law-history', { credentials: 'include', cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          serverSearchHistory = normalizeSearchHistoryItems(payload?.searchHistory);
          serverViewedHistory = normalizeViewedHistoryItems(payload?.viewedHistory);
        }
      } catch (error) {
        console.error('Failed to load synced case law history', error);
      }

      if (cancelled) return;

      setSearchHistory(normalizeSearchHistoryItems([...serverSearchHistory, ...localSearchHistory]));
      setViewedHistory(normalizeViewedHistoryItems([...serverViewedHistory, ...localViewedHistory]));
      setHistoryHydrated(true);
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
  }, [historyHydrated, searchHistory]);

  useEffect(() => {
    if (!historyHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(VIEWED_HISTORY_KEY, JSON.stringify(viewedHistory));
  }, [historyHydrated, viewedHistory]);

  useEffect(() => {
    if (!historyHydrated) return;

    if (historySyncTimeoutRef.current) {
      clearTimeout(historySyncTimeoutRef.current);
      historySyncTimeoutRef.current = null;
    }

    historySyncTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/case-law-history', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ searchHistory, viewedHistory }),
        });
      } catch (error) {
        console.error('Failed to sync case law history', error);
      }
    }, HISTORY_SYNC_DELAY_MS);

    return () => {
      if (historySyncTimeoutRef.current) {
        clearTimeout(historySyncTimeoutRef.current);
      }
    };
  }, [historyHydrated, searchHistory, viewedHistory]);

  const addSearchToHistory = useCallback((searchQuery: string, resultsCount: number) => {
    const cleanedQuery = searchQuery.trim();
    if (!cleanedQuery) return;
    setSearchHistory((prev) => {
      const deduped = prev.filter((item) => item.query.toLowerCase() !== cleanedQuery.toLowerCase());
      return [
        { query: cleanedQuery, searchedAt: new Date().toISOString(), resultsCount },
        ...deduped
      ].slice(0, SEARCH_HISTORY_LIMIT);
    });
  }, []);

  const addViewedCaseToHistory = useCallback((caseResult: CaseLawResult) => {
    setViewedHistory((prev) => {
      const deduped = prev.filter((item) => item.id !== caseResult.id);
      return [
        {
          ...caseResult,
          viewedAt: new Date().toISOString(),
        },
        ...deduped
      ].slice(0, VIEWED_HISTORY_LIMIT);
    });
  }, []);

  const openCaseDetails = useCallback((caseResult: CaseLawResult) => {
    setSelectedCase(caseResult);
    addViewedCaseToHistory(caseResult);
  }, [addViewedCaseToHistory]);

  const canUseCaseLawActions = forceAccess ? true : hasPaidAccess;

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!canUseCaseLawActions) {
      setSearchErrorModal('Plan paused: case law search is locked. Resume your plan to continue.');
      return;
    }
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const requestSeq = ++searchRequestSeqRef.current;
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    try {
      console.log('🔍 Searching for:', searchQuery);
      const response = await fetch('/api/search-case-law', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          filters: filters.case_type === 'all' ? {} : filters,
          limit: 15,
        }),
        signal: controller.signal,
      });

      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Search failed:', errorText);
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Results received:', data.results?.length || 0, 'cases');
      console.log('📊 Full response:', data);
      if (requestSeq === searchRequestSeqRef.current) {
        setResults(data.results || []);
        addSearchToHistory(searchQuery, Array.isArray(data.results) ? data.results.length : 0);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('🚨 Search error:', error);
      setSearchErrorModal(`Search error: ${error instanceof Error ? error.message : 'Unknown error'}. Check browser console for details.`);
    } finally {
      if (requestSeq === searchRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [filters, canUseCaseLawActions, addSearchToHistory]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (!canUseCaseLawActions) return;
    if (e.key === 'Enter') {
      handleSearch(query);
    }
  };

  // Handle case study generation with improved error handling
  const handleStudyCase = async (caseResult: CaseLawResult) => {
    if (!canUseCaseLawActions) {
      setStudyError('Plan paused: case law study is locked. Resume your plan to continue.');
      setShowStudyModal(true);
      return;
    }
    // Validate required fields
    if (!caseResult.title || !caseResult.citation) {
      setStudyError('Missing required case information (title or citation)');
      setShowStudyModal(true);
      return;
    }

    try {
      setStudyingCase(caseResult.id);
      setStudyCaseMeta(caseResult);
      setStudyError(null);
      setShowStudyModal(true);
      setCaseStudy(null);
      setPaginatedContent([]);
      setStudyChatInput('');
      setStudyChatMessages([]);
      setStudyChatError(null);

      console.log('🎓 Generating case study for:', caseResult.title);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch('/api/case-study', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: caseResult.title,
          citation: caseResult.citation,
          summary: caseResult.summary || 'No summary available',
          extracts: Array.isArray(caseResult.extracts) ? caseResult.extracts : [],
          court: caseResult.court || 'Not specified',
          year: caseResult.year || new Date().getFullYear(),
          outcome: caseResult.outcome || 'Not specified',
          url: caseResult.url || ''
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle specific error status codes
      if (!response.ok) {
        let errorMessage = 'Failed to generate case study';
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
          
          if (response.status === 429) {
            errorMessage = '⏳ Rate limit reached. Please wait a moment and try again.';
          } else if (response.status === 504) {
            errorMessage = '⏱️ Request timed out. This case may be too complex. Please try again.';
          } else if (response.status === 400 && errorData.details) {
            errorMessage = `❌ Invalid input: ${errorData.details.map((d: any) => d.message).join(', ')}`;
          } else if (errorData.suggestion) {
            errorMessage = `${errorMessage}. ${errorData.suggestion}`;
          }
        } catch {
          errorMessage = `Failed to generate case study (Status: ${response.status})`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Validate response data
      if (!data.success || !data.caseStudy) {
        throw new Error('Invalid response from server');
      }

      console.log('✅ Case study generated successfully', {
        words: data.totalWords,
        pages: data.totalPages,
        model: data.metadata?.model,
        isFallback: data.metadata?.isFallback
      });

      // Show warning if fallback was used
      if (data.metadata?.isFallback) {
        console.warn('⚠️ Using fallback content - AI generation may have failed');
      }

      setCaseStudy(data.caseStudy);
      setPaginatedContent(data.paginatedContent || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(1); // Reset to first page

    } catch (error) {
      console.error('🚨 Case study error:', error);
      
      let errorMessage = 'Failed to generate case study';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '⏱️ Request timed out. The case study is taking too long to generate. Please try again.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = '🌐 Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setStudyError(errorMessage);
    } finally {
      setStudyingCase(null);
    }
  };

  // Close study modal
  const closeStudyModal = () => {
    setShowStudyModal(false);
    setCaseStudy(null);
    setStudyError(null);
    setStudyingCase(null);
    setPaginatedContent([]);
    setCurrentPage(1);
    setTotalPages(1);
    setStudyCaseMeta(null);
    setStudyChatInput('');
    setStudyChatMessages([]);
    setStudyChatError(null);
  };

  // Pagination navigation functions
  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const askStudyQuestion = async () => {
    if (!canUseCaseLawActions) {
      setStudyChatError('Plan paused: case law chat is locked. Resume your plan to continue.');
      return;
    }
    const question = studyChatInput.trim();
    if (!question || studyChatLoading) return;

    setStudyChatError(null);
    setStudyChatLoading(true);
    setStudyChatInput('');
    setStudyChatMessages((prev) => [...prev, { role: 'user', content: question }]);

    try {
      const response = await fetch('/api/case-study-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          caseTitle: studyCaseMeta?.title || '',
          citation: studyCaseMeta?.citation || '',
          summary: studyCaseMeta?.summary || '',
          extracts: Array.isArray(studyCaseMeta?.extracts) ? studyCaseMeta?.extracts : [],
          court: studyCaseMeta?.court || '',
          year: studyCaseMeta?.year || '',
          outcome: studyCaseMeta?.outcome || '',
          url: studyCaseMeta?.url || '',
          studyText: caseStudy || ''
        })
      });

      if (!response.ok) {
        let message = 'Failed to get an answer. Please try again.';
        try {
          const data = await response.json();
          message = data.error || message;
        } catch {
          message = `Failed to get an answer (Status: ${response.status})`;
        }
        throw new Error(message);
      }

      const data = await response.json();
      const answer = data?.answer || 'Sorry, I could not generate an answer.';
      setStudyChatMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get an answer.';
      setStudyChatError(message);
    } finally {
      setStudyChatLoading(false);
    }
  };

  const handleStudyChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askStudyQuestion();
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  // Show loading state while checking plan
  if (!planChecked) {
    return (
      <div style={pageShellStyle}>
        <div style={{ maxWidth: workspaceMaxWidth, margin: '0 auto' }}>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-white text-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p>Loading...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hasPlanAccess = forceAccess ? true : hasCaseLawAccess(userPlan || '');

  if (!hasPlanAccess) {
    return (
      <div style={pageShellStyle}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="mb-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
                <Scale className="w-8 h-8 text-indigo-200" />
                Case Law Search
              </h1>
            <Link
                href={dashboardHref}
                className="app-button-secondary"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>

          <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                <Lock className="w-6 h-6 text-indigo-200" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Plan required</h2>
                <p className="text-indigo-100/80">Case Law Search is available on Premium + plans.</p>
              </div>
            </div>
            <p className="text-indigo-100/80 mb-6">
              Upgrade to unlock AI-powered case-law search, study summaries, and guided analysis for supported jurisdictions.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={getPublicRouteForMarket('/pricing', publicMarket)}
                className="inline-flex items-center gap-2 px-5 py-3 bg-white text-purple-900 font-semibold rounded-lg hover:bg-indigo-50"
              >
                View plans
              </Link>
              <Link
                href={settingsHref}
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
    <div style={pageShellStyle}>
      <div style={{ maxWidth: workspaceMaxWidth, margin: '0 auto' }}>
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
              <Scale className="w-8 h-8 text-indigo-200" />
              Case Law Search
            </h1>
            <Link
              href={dashboardHref}
              className="app-button-secondary"
            >
              Go to Dashboard
            </Link>
          </div>
          <p className="text-indigo-100/90">
            Explore 760 UK Supreme Court cases for study and legal understanding.
          </p>
          <p className="mt-2 text-sm text-indigo-100/80">
            Coverage note: currently UK Supreme Court (UKSC) decisions only. More courts across England &amp; Wales, Scotland, and Northern Ireland are coming soon.
          </p>
          {!canUseCaseLawActions && (
            <p className="mt-2 text-sm text-amber-200">
              Plan paused: search and study chat are read-only locked until billing is resumed.
            </p>
          )}
        </div>

        {/* Search Bar */}
        <div className={isDarkMode ? "mb-6 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] p-6 shadow-sm" : "mb-6 rounded-lg bg-white p-6 shadow-sm"}>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row">
            <div className="flex-1 relative">
              <Search className={isDarkMode ? "absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" : "absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={canUseCaseLawActions ? "Search by case name, citation, or study topic." : "Resume plan to search case law"}
                disabled={!canUseCaseLawActions}
                className={isDarkMode
                  ? "w-full rounded-lg border border-[#343434] bg-[#111111] py-3 pl-12 pr-12 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:bg-[#161616] disabled:text-slate-500"
                  : "w-full rounded-lg border border-gray-300 py-3 pl-12 pr-12 focus:border-transparent focus:ring-2 focus:ring-blue-500"}
              />
              {loading && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <div className={isDarkMode ? "h-5 w-5 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" : "h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"} />
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={isDarkMode
                ? "flex w-full items-center justify-center gap-2 rounded-lg border border-[#343434] bg-[#1f1f1f] px-4 py-3 text-slate-200 hover:bg-[#262626] sm:w-auto"
                : "flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-3 hover:bg-gray-50 sm:w-auto"}
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
            <button
              onClick={() => handleSearch(query)}
              disabled={loading || !query.trim() || !canUseCaseLawActions}
              className={isDarkMode
                ? "flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-[#3a3a3a] sm:w-auto"
                : "flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"}
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Searching...
                </>
              ) : (
                'Search Now'
              )}
            </button>
            <button
              onClick={() => setShowHistoryPanel((value) => !value)}
              className={isDarkMode
                ? "w-full rounded-lg border border-[#343434] bg-[#1f1f1f] px-4 py-3 text-sm font-medium text-slate-200 hover:bg-[#262626] sm:w-auto"
                : "w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"}
            >
              {showHistoryPanel ? 'Hide history' : 'View history'}
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className={isDarkMode ? "grid grid-cols-1 gap-4 border-t border-[#2f2f2f] pt-4 md:grid-cols-4" : "grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-4"}>
              <div>
                <label className={isDarkMode ? "mb-2 block text-sm font-medium text-slate-200" : "mb-2 block text-sm font-medium text-gray-700"}>
                  Case Type
                </label>
                <select
                  value={filters.case_type}
                  onChange={(e) => setFilters({ ...filters, case_type: e.target.value })}
                  className={isDarkMode
                    ? "w-full rounded-lg border border-[#343434] bg-[#111111] px-3 py-2 text-slate-100 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                    : "w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"}
                >
                  <option value="all">All Types</option>
                  <option value="employment">Employment</option>
                  <option value="housing">Housing</option>
                  <option value="contract">Contract</option>
                  <option value="family">Family</option>
                  <option value="personal-injury">Personal Injury</option>
                  <option value="criminal">Criminal</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className={isDarkMode ? "mb-2 block text-sm font-medium text-slate-200" : "mb-2 block text-sm font-medium text-gray-700"}>
                  Year From
                </label>
                <input
                  type="number"
                  value={filters.year_from || ''}
                  onChange={(e) => setFilters({ ...filters, year_from: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2009"
                  min="2009"
                  max="2024"
                  className={isDarkMode
                    ? "w-full rounded-lg border border-[#343434] bg-[#111111] px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                    : "w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"}
                />
              </div>

              <div>
                <label className={isDarkMode ? "mb-2 block text-sm font-medium text-slate-200" : "mb-2 block text-sm font-medium text-gray-700"}>
                  Year To
                </label>
                <input
                  type="number"
                  value={filters.year_to || ''}
                  onChange={(e) => setFilters({ ...filters, year_to: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2024"
                  min="2009"
                  max="2024"
                  className={isDarkMode
                    ? "w-full rounded-lg border border-[#343434] bg-[#111111] px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                    : "w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500"}
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => setFilters({ case_type: 'all' })}
                  className={isDarkMode
                    ? "w-full rounded-lg border border-[#343434] px-4 py-2 text-sm text-slate-300 hover:bg-[#262626]"
                    : "w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"}
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

        {showHistoryPanel && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Recent searches</h3>
                {searchHistory.length > 0 && (
                  <button
                    onClick={() => setSearchHistory([])}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              {searchHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No recent searches yet.</p>
              ) : (
                <div className="space-y-2">
                  {searchHistory.map((item) => (
                    <button
                      key={`${item.query}-${item.searchedAt}`}
                      onClick={() => {
                        setQuery(item.query);
                        handleSearch(item.query);
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <div className="text-sm font-medium text-gray-900 truncate">{item.query}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {item.resultsCount} result{item.resultsCount === 1 ? '' : 's'} • {new Date(item.searchedAt).toLocaleString('en-GB')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Recently viewed</h3>
                {viewedHistory.length > 0 && (
                  <button
                    onClick={() => setViewedHistory([])}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
              {viewedHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No viewed cases yet.</p>
              ) : (
                <div className="space-y-2">
                  {viewedHistory.map((item) => (
                    <button
                      key={`${item.id}-${item.viewedAt}`}
                      onClick={() => {
                        openCaseDetails({
                          id: item.id,
                          citation: item.citation,
                          title: item.title,
                          court: item.court,
                          year: item.year,
                          case_type: item.case_type || 'general',
                          outcome: item.outcome,
                          similarity: item.similarity || 0,
                          summary: item.summary,
                          url: item.url,
                          extracts: item.extracts,
                        });
                      }}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50"
                    >
                      <div className="text-xs font-medium text-blue-700">{item.citation}</div>
                      <div className="text-sm text-gray-900 truncate">{item.title}</div>
                      <div className="text-xs text-gray-500 mt-1">{new Date(item.viewedAt).toLocaleString('en-GB')}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              Found {results.length} relevant cases
            </div>

            {results.map((result) => (
              <div
                key={result.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openCaseDetails(result)}
              >
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                        {result.citation}
                      </span>
                      <span className="text-sm text-gray-500 flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {result.year || 'Unknown'}
                      </span>
                      {result.case_type && (
                        <span className="text-sm text-gray-500 capitalize">
                          {result.case_type}
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {result.title}
                    </h3>
                    {result.summary && (
                      <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                        {result.summary}
                      </p>
                    )}
                  </div>
                  <div className="text-left sm:ml-4 sm:text-right">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      Relevance
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round(result.similarity * 100)}%
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  {result.court && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {result.court}
                    </span>
                  )}
                  {result.outcome && (
                    <span className="capitalize">
                      Outcome: {result.outcome}
                    </span>
                  )}
                  {result.url && (
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        addViewedCaseToHistory(result);
                      }}
                    >
                      View Full Case
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addViewedCaseToHistory(result);
                      handleStudyCase(result);
                    }}
                    disabled={studyingCase === result.id}
                    className="flex items-center gap-1 text-green-600 hover:text-green-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {studyingCase === result.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Studying...
                      </>
                    ) : (
                      <>
                        Study Case
                        <BookOpen className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && query && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Scale className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No cases found
            </h3>
            <p className="text-gray-600">
              Try adjusting your search query or filters
            </p>
          </div>
        )}

        {/* Initial State */}
        {!loading && results.length === 0 && !query && (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Start searching case law
            </h3>
            <p className="text-gray-600 mb-6">
              Enter a case name, citation, or topic to explore UK Supreme Court judgments
            </p>
            <div className="text-sm text-gray-500 space-y-2">
              <p className="font-medium">Example study searches:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'employment discrimination',
                  'landlord eviction notice',
                  'contract breach damages',
                  'unfair dismissal compensation',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setQuery(example);
                      handleSearch(example);
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Case Detail Modal */}
        {selectedCase && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedCase(null)}
          >
            <div
              className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    {selectedCase.citation}
                  </span>
                  <h2 className="text-2xl font-bold text-gray-900 mt-3">
                    {selectedCase.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600 sm:gap-4">
                    {selectedCase.year && <span>{selectedCase.year}</span>}
                    {selectedCase.court && <span>• {selectedCase.court}</span>}
                    {selectedCase.case_type && (
                      <span className="capitalize">• {selectedCase.case_type}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCase(null)}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {selectedCase.summary && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Summary</h3>
                  <p className="text-gray-700 leading-relaxed">{selectedCase.summary}</p>
                </div>
              )}

              {normalizeExtracts(selectedCase.extracts).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Extracts</h3>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    <ul className="list-disc pl-5 space-y-2">
                      {normalizeExtracts(selectedCase.extracts).map((extract, index) => (
                        <li key={`${selectedCase.id}-extract-${index}`}>{extract}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedCase.url && (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addViewedCaseToHistory(selectedCase);
                      window.open(selectedCase.url, '_blank', 'noopener');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Open Full Case
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Case Study Modal */}
        {showStudyModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={closeStudyModal}
          >
            <div
              className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
                  <BookOpen className="w-6 h-6 text-green-600" />
                  Case Study Analysis
                </h2>
                <button
                  onClick={closeStudyModal}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {studyingCase && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin mr-3" />
                  <span className="text-lg text-gray-600">Generating detailed case study...</span>
                </div>
              )}

              {studyError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                  <div className="text-red-600 mb-2">⚠️ Error generating case study</div>
                  <div className="text-gray-700">{studyError}</div>
                  <button
                    onClick={closeStudyModal}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Close
                  </button>
                </div>
              )}

              {caseStudy && !studyingCase && (
                <>
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="mb-6 flex flex-col gap-3 rounded-lg bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        onClick={goToPreviousPage}
                        disabled={currentPage === 1}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-600">
                          Page {currentPage} of {totalPages}
                        </span>
                        <div className="flex gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => goToPage(pageNum)}
                                className={`w-8 h-8 rounded text-sm font-medium ${
                                  currentPage === pageNum
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      
                      <button
                        onClick={goToNextPage}
                        disabled={currentPage === totalPages}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Current Page Content */}
                  <div className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8">
                    <div className="space-y-8 text-[17px] leading-8 text-gray-800">
                      {studySections.map((section, sectionIndex) => (
                        <section key={`study-section-${sectionIndex}`} className="space-y-4">
                          {section.heading && (
                            <h3 className="border-b border-gray-300 pb-2 text-xl font-semibold tracking-tight text-gray-900">
                              {section.heading}
                            </h3>
                          )}
                          <div className="space-y-4">
                            {section.items.map((item, itemIndex) => {
                              if (item.kind === 'bullet') {
                                return (
                                  <div key={`study-item-${sectionIndex}-${itemIndex}`} className="flex gap-3">
                                    <span className="mt-2 h-2 w-2 rounded-full bg-indigo-500" />
                                    <p>{item.text}</p>
                                  </div>
                                );
                              }
                              return (
                                <p key={`study-item-${sectionIndex}-${itemIndex}`} className="text-gray-800">
                                  {item.text}
                                </p>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>

                  {/* Study Chat */}
                  <div className="mt-8 border-t border-gray-200 pt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Ask a question about this case</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Ask educational questions about the case study. The answers are based on the study notes above.
                    </p>

                    <div className="space-y-3 mb-4 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-4">
                      {studyChatMessages.length === 0 && (
                        <div className="text-sm text-gray-500">No questions yet. Ask something specific about the case.</div>
                      )}
                      {studyChatMessages.map((message, index) => (
                        <div
                          key={`study-chat-${index}`}
                          className={`rounded-lg p-3 text-sm leading-relaxed ${
                            message.role === 'user'
                              ? 'bg-blue-600 text-white ml-auto max-w-[85%]'
                              : 'bg-white text-gray-800 border border-gray-200 max-w-[85%]'
                          }`}
                        >
                          {message.content}
                        </div>
                      ))}
                      {studyChatLoading && (
                        <div className="rounded-lg p-3 text-sm text-gray-600 bg-white border border-gray-200">
                          Thinking...
                        </div>
                      )}
                    </div>

                    {studyChatError && (
                      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {studyChatError}
                      </div>
                    )}

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Your question</label>
                        <textarea
                          value={studyChatInput}
                          onChange={(e) => setStudyChatInput(e.target.value)}
                          onKeyDown={handleStudyChatKeyDown}
                          placeholder={canUseCaseLawActions ? "Ask about the facts, reasoning, or outcome..." : "Resume plan to ask case-law study questions"}
                          disabled={!canUseCaseLawActions}
                          className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          rows={2}
                        />
                      </div>
                      <button
                        onClick={askStudyQuestion}
                        disabled={studyChatLoading || !studyChatInput.trim() || !canUseCaseLawActions}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        <Send className="w-4 h-4" />
                        Ask
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {searchErrorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Search Error</h3>
              <p className="mb-4 text-sm text-gray-700">{searchErrorModal}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setSearchErrorModal(null)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
