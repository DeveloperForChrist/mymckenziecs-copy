'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Filter, ExternalLink, Scale, Calendar, Building2, ArrowLeft, Lock, BookOpen, Loader2, ChevronLeft, ChevronRight, MessageCircle, Send } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';

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

interface SearchFilters {
  case_type: string;
  year_from?: number;
  year_to?: number;
  court?: string;
  outcome?: string;
}

export default function CaseLawSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CaseLawResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseLawResult | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    case_type: 'all',
  });
  const [userPlan, setUserPlan] = useState<string>('freemium');
  const [planChecked, setPlanChecked] = useState(false);
  const [studyingCase, setStudyingCase] = useState<string | null>(null);
  const [caseStudy, setCaseStudy] = useState<string | null>(null);
  const [studyError, setStudyError] = useState<string | null>(null);
  const [studyCaseMeta, setStudyCaseMeta] = useState<CaseLawResult | null>(null);
  const [studyChatInput, setStudyChatInput] = useState('');
  const [studyChatMessages, setStudyChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [studyChatLoading, setStudyChatLoading] = useState(false);
  const [studyChatError, setStudyChatError] = useState<string | null>(null);
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [paginatedContent, setPaginatedContent] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Check user's plan on component mount
  useEffect(() => {
    const checkUserPlan = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', user.id)
            .single();
          
          setUserPlan(profile?.plan || 'freemium');
        } else {
          setUserPlan('freemium');
        }
      } catch (error) {
        console.error('Error checking user plan:', error);
        setUserPlan('freemium');
      } finally {
        setPlanChecked(true);
      }
    };

    checkUserPlan();
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
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
      setResults(data.results || []);
    } catch (error) {
      console.error('🚨 Search error:', error);
      // Show error to user for debugging
      alert(`Search error: ${error instanceof Error ? error.message : 'Unknown error'}. Check browser console for details.`);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Auto-search with debouncing as user types
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (query.trim()) {
        handleSearch(query);
      } else {
        setResults([]);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(debounceTimer);
  }, [query, handleSearch]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(query);
    }
  };

  // Handle case study generation with improved error handling
  const handleStudyCase = async (caseResult: CaseLawResult) => {
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
      <div style={{
        background: 'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.22), transparent 28%), radial-gradient(circle at 82% 8%, rgba(236,72,153,0.2), transparent 25%), linear-gradient(135deg, #0f1027 0%, #120c2f 48%, #0b0c1c 100%)',
        minHeight: '100vh',
        padding: '24px'
      }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
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

  const normalizedPlan = (userPlan || '').toString().toLowerCase();
  const hasPlanAccess = normalizedPlan.includes('premium') || normalizedPlan.includes('essential') || normalizedPlan.includes('plus') || normalizedPlan.includes('pro');

  if (!hasPlanAccess) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #270427 0%, #2d0f47 50%, #1a0420 100%)',
        minHeight: '100vh',
        padding: '24px'
      }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <Scale className="w-8 h-8 text-indigo-200" />
                Case Law Search
              </h1>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2 text-white hover:text-gray-200 hover:bg-white/10 rounded-lg transition-colors border border-white/20"
              >
                <ArrowLeft className="w-5 h-5" />
                Back to Dashboard
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
                <p className="text-indigo-100/80">Case Law Search is available on Essential and Plus plans.</p>
              </div>
            </div>
            <p className="text-indigo-100/80 mb-6">
              Upgrade to unlock AI‑powered UK case law search, study summaries, and guided analysis.
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
    <div style={{
      background: 'linear-gradient(135deg, #270427 0%, #2d0f47 50%, #1a0420 100%)',
      minHeight: '100vh',
      padding: '24px'
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Scale className="w-8 h-8 text-indigo-200" />
              Case Law Search
            </h1>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 text-white hover:text-gray-200 hover:bg-white/10 rounded-lg transition-colors border border-white/20"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Dashboard
            </Link>
          </div>
          <p className="text-indigo-100/90">
            Search through 760 UK Supreme Court cases using AI-powered semantic search. Results appear as you type.
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search case law by name, citation, or legal issue…"
                className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {loading && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
            <button
              onClick={() => handleSearch(query)}
              disabled={loading || !query.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Searching...
                </>
              ) : (
                'Search Now'
              )}
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Case Type
                </label>
                <select
                  value={filters.case_type}
                  onChange={(e) => setFilters({ ...filters, case_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year From
                </label>
                <input
                  type="number"
                  value={filters.year_from || ''}
                  onChange={(e) => setFilters({ ...filters, year_from: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2009"
                  min="2009"
                  max="2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Year To
                </label>
                <input
                  type="number"
                  value={filters.year_to || ''}
                  onChange={(e) => setFilters({ ...filters, year_to: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="2024"
                  min="2009"
                  max="2024"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => setFilters({ case_type: 'all' })}
                  className="w-full px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}
        </div>

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
                onClick={() => setSelectedCase(result)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
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
                  <div className="ml-4 text-right">
                    <div className="text-sm font-medium text-gray-900 mb-1">
                      Relevance
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {Math.round(result.similarity * 100)}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-500">
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
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Full Case
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
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
              Enter a description of your legal issue to find relevant UK Supreme Court cases
            </p>
            <div className="text-sm text-gray-500 space-y-2">
              <p className="font-medium">Example searches:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'employment discrimination',
                  'landlord eviction notice',
                  'contract breach damages',
                  'unfair dismissal compensation',
                ].map((example) => (
                  <button
                    key={example}
                    onClick={() => setQuery(example)}
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
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                    {selectedCase.citation}
                  </span>
                  <h2 className="text-2xl font-bold text-gray-900 mt-3">
                    {selectedCase.title}
                  </h2>
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
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

              {selectedCase.extracts && selectedCase.extracts.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Extracts</h3>
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    <ul className="list-disc pl-5 space-y-2">
                      {selectedCase.extracts.map((extract, index) => (
                        <li key={`${selectedCase.id}-extract-${index}`}>{extract}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedCase.url && (
                <div className="flex gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(selectedCase.url, '_blank', 'noopener');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Open Full Case
                    <ExternalLink className="w-4 h-4" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(selectedCase.url, '_blank', 'noopener');
                      setSelectedCase(null);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
                  >
                    Open and Close
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
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
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
                    <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-lg">
                      <button
                        onClick={goToPreviousPage}
                        disabled={currentPage === 1}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </button>
                      
                      <div className="flex items-center gap-2">
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
                  <div className="whitespace-pre-wrap text-gray-800 leading-relaxed text-sm">
                    {paginatedContent[currentPage - 1]?.content || caseStudy}
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
                          placeholder="Ask about the facts, reasoning, or outcome..."
                          className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          rows={2}
                        />
                      </div>
                      <button
                        onClick={askStudyQuestion}
                        disabled={studyChatLoading || !studyChatInput.trim()}
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
      </div>
    </div>
  );
}
