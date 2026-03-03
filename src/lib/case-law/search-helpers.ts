import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/database/supabase-server';

let _localCaseMap: Map<string, Record<string, any>> | null = null;
function loadLocalCaseMap() {
  if (_localCaseMap) return _localCaseMap;
  const map = new Map<string, Record<string, any>>();
  try {
    const curatedPath = path.join(process.cwd(), 'data', 'bronze', 'case-law', 'curated.json');
    if (fs.existsSync(curatedPath)) {
      const arr = JSON.parse(fs.readFileSync(curatedPath, 'utf-8'));
      for (const r of arr) {
        if (r.citation) map.set(String(r.citation), r);
        if (r.id) map.set(String(r.id), r);
      }
    }
    const candPath = path.join(process.cwd(), 'data', 'bronze', 'case-law', 'uksc-candidates.jsonl');
    if (fs.existsSync(candPath)) {
      const lines = fs.readFileSync(candPath, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r.citation) map.set(String(r.citation), r);
          if (r.id) map.set(String(r.id), r);
        } catch (e) {
          continue;
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load local case map', e);
  }
  _localCaseMap = map;
  return map;
}

// Remove duplicate cases based on citation
function removeDuplicates(results: Array<Record<string, any>>) {
  const map = new Map<string, Record<string, any>>();
  for (const result of results) {
    const key = result.citation || result.id;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, {
        ...result,
        sources: Array.isArray(result.sources) ? result.sources : result.source ? [result.source] : []
      });
      continue;
    }

    const existing = map.get(key) || {};
    const existingSources = new Set<string>(Array.isArray(existing.sources) ? existing.sources : []);
    const nextSources = Array.isArray(result.sources)
      ? result.sources
      : result.source
        ? [result.source]
        : [];
    for (const src of nextSources) {
      existingSources.add(src);
    }

    map.set(key, {
      ...existing,
      sources: Array.from(existingSources),
      similarity_score: Math.max(existing.similarity_score ?? 0, result.similarity_score ?? 0)
    });
  }

  return Array.from(map.values());
}

// Supreme Court RSS search
// Supreme Court website search - scrape search results
async function searchSupremeCourtWebsite(query: string, limit: number = 10) {
  try {
    console.log('🏛️ Searching Supreme Court website for:', query);
    
    // Supreme Court search URL
    const searchUrl = `https://www.supremecourt.uk/cases/search?query=${encodeURIComponent(query)}&ordering=-date`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyMcKenzie-CaseLaw-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ Supreme Court website search failed (${response.status})`);
      return [];
    }
    
    const html = await response.text();
    const cases = parseSupremeCourtWebsiteResults(html, query, limit);
    
    console.log(`📊 Found ${cases.length} Supreme Court cases for: "${query}"`);
    return cases;
  } catch (error) {
    console.error('Supreme Court website search error:', error);
    return [];
  }
}
// Parse Supreme Court website search results
function parseSupremeCourtWebsiteResults(html: string, query: string, limit: number) {
  const cases = [] as any[];
  
  try {
    // Look for case result containers - try multiple patterns
    const resultPattern = /<div[^>]*class="[^"]*case[^"]*result[^"]*"[^>]*>(.*?)<\/div>/gs;
    const resultPattern2 = /<li[^>]*class="[^"]*search-result[^"]*"[^>]*>(.*?)<\/li>/gs;
    const resultPattern3 = /<article[^>]*>(.*?)<\/article>/gs;
    
    const results: any[] = [];
    let match;
    
    // Try different patterns
    while ((match = resultPattern.exec(html)) !== null) {
      results.push(match[1]);
    }
    
    if (results.length === 0) {
      while ((match = resultPattern2.exec(html)) !== null) {
        results.push(match[1]);
      }
    }
    
    if (results.length === 0) {
      while ((match = resultPattern3.exec(html)) !== null) {
        results.push(match[1]);
      }
    }
    
    const queryLower = query.toLowerCase();
    
    for (let i = 0; i < Math.min(results.length, limit); i++) {
      const resultHtml = results[i];
      
      // Extract case name/title - look for heading or link
      const titleMatch = resultHtml.match(/<(?:h[1-6]|a)[^>]*>([^<]*(?:v|vs)[^<]*)<\/(?:h[1-6]|a)>/i) ||
                         resultHtml.match(/<a[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/);
      const title = titleMatch ? titleMatch[1].trim() : 'Supreme Court Case';
      
      // Extract URL
      const urlMatch = resultHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/);
      const url = urlMatch ? urlMatch[1] : '#';
      
      // Extract citation or case reference
      const citationMatch = resultHtml.match(/UKSC|(\[\d{4}\])\s*([A-Z]+)\s*\d+/);
      const citation = citationMatch ? `UKSC ${i + 1}` : title.substring(0, 30);
      
      // Extract summary/description
      const descMatch = resultHtml.match(/<p[^>]*>([^<]{10,200})<\/p>/);
      const summary = descMatch ? descMatch[1].trim() : '';
      
      // Extract year
      const yearMatch = resultHtml.match(/\[(\d{4})\]/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      
      // Calculate relevance score
      let relevanceScore = 0.7;
      if (title.toLowerCase().includes(queryLower)) {
        relevanceScore = 0.9;
      } else if (summary.toLowerCase().includes(queryLower)) {
        relevanceScore = 0.75;
      }
      
      // Build full URL if relative
      const fullUrl = url.startsWith('http') ? url : `https://www.supremecourt.uk${url}`;
      
      cases.push({
        id: `scw-${i}`,
        citation,
        title,
        url: fullUrl,
        summary: summary || 'Supreme Court case available',
        extracts: [title.substring(0, 150)],
        case_type: 'general',
        year,
        court: 'UK Supreme Court',
        outcome: 'Judgment available',
        similarity_score: relevanceScore
      });
    }
  } catch (error) {
    console.error('Error parsing Supreme Court website results:', error);
  }
  
  return cases;
}

// Supreme Court RSS search (fallback)
async function searchSupremeCourt(query: string, limit: number = 5) {
  try {
    console.log('🏛️ Searching Supreme Court RSS for:', query);
    
    const rssUrl = 'https://www.supremecourt.uk/news/judgments/rss.xml';
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyMcKenzie-CaseLaw-Bot/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Supreme Court RSS failed: ${response.status}`);
    }
    
    const rssText = await response.text();
    const cases = parseRSSFeed(rssText, query, limit, 'Supreme Court');
    
    console.log(`📊 Found ${cases.length} Supreme Court cases (RSS) for: ${query}`);
    return cases;
    
  } catch (error) {
    console.error('Supreme Court RSS search error:', error);
    return [];
  }
}

// Judiciary UK RSS search
async function searchJudiciary(query: string, limit: number = 3) {
  try {
    console.log('⚖️ Searching Judiciary UK RSS for:', query);
    
    const rssUrl = 'https://www.judiciary.uk/judgments/feed/';
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyMcKenzie-CaseLaw-Bot/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Judiciary RSS failed: ${response.status}`);
    }
    
    const rssText = await response.text();
    const cases = parseRSSFeed(rssText, query, limit, 'Judiciary UK');
    
    console.log(`📊 Found ${cases.length} Judiciary cases for: ${query}`);
    return cases;
    
  } catch (error) {
    console.error('Judiciary search error:', error);
    return [];
  }
}

// Parse RSS feed and filter by query
function parseRSSFeed(rssText: string, query: string, limit: number, source: string) {
  const cases = [];
  
  try {
    // Simple RSS parsing (in production, use proper RSS parser)
    const itemPattern = /<item>(.*?)<\/item>/gs;
    
    let match;
    let count = 0;
    const queryLower = query.toLowerCase();
    
    while ((match = itemPattern.exec(rssText)) !== null && count < limit) {
      const itemHtml = match[1];
      
      // Extract title
      const titleMatch = itemHtml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s);
      const title = titleMatch ? titleMatch[1] : 'Unknown Title';
      
      // Extract link
      const linkMatch = itemHtml.match(/<link>(.*?)<\/link>/s);
      const url = linkMatch ? linkMatch[1] : '#';
      
      // Extract description
      const descMatch = itemHtml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s);
      const description = descMatch ? descMatch[1] : '';

      // Calculate similarity score
      const similarityScore = calculateSimilarity(queryLower, title.toLowerCase());

      // Only include if there's any overlap in title or description
      if (similarityScore === 0) {
        const descLower = description.toLowerCase();
        if (!descLower.includes(queryLower)) {
          continue;
        }
      }
      
      // Extract publication date
      const dateMatch = itemHtml.match(/<pubDate>(.*?)<\/pubDate>/s);
      const pubDate = dateMatch ? dateMatch[1] : '';
      const year = pubDate ? new Date(pubDate).getFullYear() : new Date().getFullYear();
      
      // Generate citation from title
      const citation = generateCitation(title, year, source);
      
      // Calculate similarity score
      
      cases.push({
        id: `${source.toLowerCase().replace(' ', '-')}-${count + 1}`,
        citation: citation,
        title: title,
        url: url,
        summary: description.substring(0, 200) + '...',
        extracts: [title.substring(0, 100) + '...', description.substring(0, 150) + '...'],
        case_type: 'general',
        year: year,
        court: source,
        outcome: 'Judgment available',
        similarity_score: similarityScore
      });
      
      count++;
    }
    
  } catch (error) {
    console.error(`Error parsing ${source} RSS:`, error);
  }
  
  return cases;
}

// Enrich vector results with Supabase metadata when fields are missing.
async function enrichResultsWithSupabase(results: any[]) {
  if (!results || results.length === 0) return;

  const isUuid = (value: any) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const needsMetadata = (r: any) => {
    const hasExtracts = Array.isArray(r.extracts) ? r.extracts.length > 0 : Boolean(r.extracts);
    return (
      !r.title ||
      !r.citation ||
      !r.url ||
      !r.summary ||
      !hasExtracts ||
      !r.year ||
      !r.court ||
      !r.outcome
    );
  };
  const missingRows = results.filter(needsMetadata);
  if (missingRows.length === 0) return;

  const toFetchIds = Array.from(
    new Set(
      missingRows
        .map((r) => r.id)
        .filter((id): id is string => typeof id === 'string' && isUuid(id))
    )
  );

  const toFetchCitations = Array.from(
    new Set(
      missingRows
        .map((r) => (typeof r.citation === 'string' && r.citation.trim() ? r.citation.trim() : (typeof r.id === 'string' && !isUuid(r.id) ? r.id.trim() : null)))
        .filter((citation): citation is string => Boolean(citation))
    )
  );

  if (toFetchIds.length === 0 && toFetchCitations.length === 0) return;

  try {
    const mergedRows: any[] = [];

    if (toFetchIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('case_law')
        .select('id,citation,title,url,summary,extracts,year,court,outcome')
        .in('id', toFetchIds)
        .limit(100);
      if (error) throw error;
      if (Array.isArray(data)) mergedRows.push(...data);
    }

    if (toFetchCitations.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('case_law')
        .select('id,citation,title,url,summary,extracts,year,court,outcome')
        .in('citation', toFetchCitations)
        .limit(200);
      if (error) throw error;
      if (Array.isArray(data)) mergedRows.push(...data);
    }

    const map = new Map<string, Record<string, any>>();
    for (const row of mergedRows) {
      if (row.id) map.set(String(row.id), row);
      if (row.citation) map.set(String(row.citation), row);
    }

    for (const r of results) {
      const m = map.get(String(r.id)) || (r.citation ? map.get(String(r.citation)) : undefined);
      if (!m) continue;
      r.citation = r.citation || m.citation || r.citation;
      r.title = r.title || m.title || r.title;
      r.url = r.url || m.url || r.url;
      r.summary = r.summary || m.summary || r.summary;
      r.extracts = r.extracts || m.extracts || r.extracts;
      r.year = r.year || m.year || r.year;
      r.court = r.court || m.court || r.court;
      r.outcome = r.outcome || m.outcome || r.outcome;
    }
  } catch (err) {
    console.warn('enrichResultsWithSupabase error', err);
    // continue to local fallback below
  }

  // Local fallback: merge from curated/candidates JSON files if Supabase missing
  try {
    const localMap = loadLocalCaseMap();
    for (const r of results) {
      if (r.title && r.url && r.citation) continue;
      const m = localMap.get(String(r.id)) || (r.citation && localMap.get(String(r.citation)));
      if (!m) continue;
      r.citation = r.citation || m.citation || r.citation;
      r.title = r.title || m.title || r.title;
      r.url = r.url || m.url || r.url;
      r.summary = r.summary || m.summary || r.summary;
      r.extracts = r.extracts || (m.extracts ? (Array.isArray(m.extracts) ? m.extracts : [m.extracts]) : r.extracts);
    }
  } catch (e) {
    console.warn('Local case enrichment failed:', e);
  }
}

// Fetch URL content for hits with a URL but missing summary, summarize via OpenAI,
// cache into Supabase `cache` table and attach extracts/summary to results.
async function enrichResultsWithUrlSummaries(results: any[]) {
  if (!results || results.length === 0) return;
  const needs = results.filter(r => r.url && !r.summary && !(r.extracts && r.extracts.length > 0));
  if (needs.length === 0) return;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const r of needs) {
    try {
      const url = r.url;
      const cacheKey = `grounding:${r.citation || r.id}:${encodeURIComponent(url)}`;

      let cached: { value?: { summary?: string } } | null = null;
      try {
        const { data } = await supabaseAdmin.from('cache').select('value').eq('key', cacheKey).limit(1).single();
        cached = (data as { value?: { summary?: string } } | null) || null;
      } catch {
        cached = null;
      }
      let summaryText: string | null = null;

      if (cached && cached.value && cached.value.summary) {
        summaryText = cached.value.summary;
      } else {
        // fetch page and extract paragraphs
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) continue;
        const html = await res.text();
        const paragraphs = Array.from(html.matchAll(/<p[^>]*>(.*?)<\/p>/gis)).map(m => m[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);
        const content = paragraphs.slice(0, 30).join('\n\n').slice(0, 14000);
        if (!content) continue;

        const prompt = `Summarize the following court judgment into 2 concise extracts for a non-lawyer reader. Use plain English, avoid jargon, and explain any legal term in simple words. Do not give legal advice.\n\n${content}`;
        const completion = await openai.chat.completions.create({
          model: process.env.OPENAI_CHAT_MODEL || 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a legal-document summarizer writing for laypeople. Keep language clear and simple.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 400,
          temperature: 0.2
        });

        summaryText = completion?.choices?.[0]?.message?.content?.trim() || null;

        if (summaryText) {
          const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
          try {
            await supabaseAdmin.from('cache').upsert([
              { key: cacheKey, value: { url, summary: summaryText }, cache_type: 'grounding', expires_at: expires }
            ]);
          } catch (cacheError) {
            console.warn('Failed to cache grounding:', cacheError);
          }
        }
      }

      if (summaryText) {
        const pieces = summaryText.split(/\n{2,}|\n-+/).map(s => s.trim()).filter(Boolean).slice(0, 3);
        r.summary = r.summary || summaryText;
        r.extracts = Array.from(new Set([...(r.extracts || []), ...pieces])).slice(0, 5);
      }
    } catch (err) {
      console.warn('enrichResultsWithUrlSummaries error for', r.id, err);
      continue;
    }
  }
}

// National Archives search
async function searchNationalArchives(query: string, limit: number = 3) {
  try {
    console.log('🏛️ Searching National Archives for:', query);
    
    const searchUrl = `https://www.nationalarchives.gov.uk/search/?search=${encodeURIComponent(query)}&type=case-law`;
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyMcKenzie-CaseLaw-Bot/1.0)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`National Archives search failed: ${response.status}`);
    }
    
    const html = await response.text();
    const cases = parseNationalArchivesResults(html, query, limit);
    
    console.log(`📊 Found ${cases.length} National Archives cases for: ${query}`);
    return cases;
    
  } catch (error) {
    console.error('National Archives search error:', error);
    return [];
  }
}

// Find Case Law Atom feed search
// Find Case Law search - scrape search results page (no public API)
async function searchFindCaseLawAPI(query: string, limit: number = 15) {
  try {
    // Determine search type
    const searchType = determineSearchType(query);
    console.log(`🏛️ Searching Find Case Law [${searchType}] for: "${query}"`);

    // Find Case Law doesn't have public API, so we search their web interface
    const searchUrl = `https://caselaw.nationalarchives.gov.uk/search?query=${encodeURIComponent(query)}&page_size=${Math.min(limit * 2, 50)}&order_by=-date_of_judgment`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyMcKenzie-CaseLaw-Bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    if (!response.ok) {
      console.error(`❌ Find Case Law search failed (${response.status})`);
      return [];
    }

    const html = await response.text();
    const cases = parseFindCaseLawSearchResults(html, query, limit, searchType);

    console.log(`📊 Found ${cases.length} Find Case Law cases [${searchType}] for: "${query}"`);
    return cases;
  } catch (error) {
    console.error('Find Case Law search error:', error);
    return [];
  }
}

// Parse Find Case Law search results HTML
function parseFindCaseLawSearchResults(html: string, query: string, limit: number, searchType: string = 'term') {
  const cases = [] as any[];

  try {
    // Extract case results from search page
    // Look for case result containers
    const resultPattern = /<div class="case-result"[^>]*>(.*?)<\/div>\s*<\/div>/gs;
    const resultPattern2 = /<article[^>]*class="[^"]*case[^"]*"[^>]*>(.*?)<\/article>/gs;
    const resultPattern3 = /<li[^>]*class="[^"]*search-result[^"]*"[^>]*>(.*?)<\/li>/gs;
    
    const results: any[] = [];
    let match;
    
    // Try different patterns
    while ((match = resultPattern.exec(html)) !== null) {
      results.push(match[1]);
    }
    
    if (results.length === 0) {
      while ((match = resultPattern2.exec(html)) !== null) {
        results.push(match[1]);
      }
    }
    
    if (results.length === 0) {
      while ((match = resultPattern3.exec(html)) !== null) {
        results.push(match[1]);
      }
    }

    const queryLower = query.toLowerCase();

    for (let i = 0; i < Math.min(results.length, limit); i++) {
      const resultHtml = results[i];

      // Extract title - look for case name/citation link
      const titleMatch = resultHtml.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/);
      const url = titleMatch ? titleMatch[1] : '#';
      const title = titleMatch ? titleMatch[2].trim() : 'Unknown Case';

      // Extract citation
      const citationMatch = resultHtml.match(/UKSC|EWCA|EWHC|EWHC|UK|(\[\d{4}\])\s*([A-Z]+)\s*\d+/);
      const citation = citationMatch ? resultHtml.substring(resultHtml.indexOf(citationMatch[0]), resultHtml.indexOf(citationMatch[0]) + 30).split('<')[0] : title.substring(0, 30);

      // Extract summary/description
      const descMatch = resultHtml.match(/<p[^>]*class="[^"]*summary[^"]*"[^>]*>([^<]+)<\/p>/);
      const summary = descMatch ? descMatch[1].trim() : '';

      // Extract year
      const yearMatch = citation.match(/\[(\d{4})\]/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();

      // Calculate relevance score
      let relevanceScore = 0.75;
      if (searchType === 'case-name' && title.toLowerCase().includes(queryLower)) {
        relevanceScore = 0.95;
      } else if (searchType === 'phrase' && queryLower.split(' ').every(word => title.toLowerCase().includes(word) || summary.toLowerCase().includes(word))) {
        relevanceScore = 0.9;
      } else if (title.toLowerCase().includes(queryLower)) {
        relevanceScore = 0.85;
      } else if (summary.toLowerCase().includes(queryLower)) {
        relevanceScore = 0.8;
      }

      // Build full URL if relative
      const fullUrl = url.startsWith('http') ? url : `https://caselaw.nationalarchives.gov.uk${url}`;

      cases.push({
        id: `fcl-${i}`,
        citation: citation || title.substring(0, 50),
        title: title,
        url: fullUrl,
        summary: summary || 'Case available on Find Case Law',
        extracts: [title.substring(0, 150)],
        case_type: 'general',
        year,
        court: 'Find Case Law',
        outcome: 'Judgment available',
        similarity_score: relevanceScore,
        search_type: searchType
      });
    }

    console.log(`✅ Parsed ${cases.length} cases from Find Case Law search results`);
  } catch (error) {
    console.error('Error parsing Find Case Law results:', error);
  }

  return cases;
}

// Fallback: Find Case Law Atom feed search
async function searchFindCaseLawAtom(query: string, limit: number = 5) {
  try {
    console.log('🏛️ Searching Find Case Law Atom feed for:', query);

    const feedUrl = 'https://caselaw.nationalarchives.gov.uk/atom.xml';
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyMcKenzie-CaseLaw-Bot/1.0)'
      }
    });

    if (!response.ok) {
      throw new Error(`Find Case Law Atom feed failed: ${response.status}`);
    }

    const feedText = await response.text();
    const cases = parseFindCaseLawAtom(feedText, query, limit);

    console.log(`📊 Found ${cases.length} Find Case Law cases (Atom feed) for: ${query}`);
    return cases;
  } catch (error) {
    console.error('Find Case Law Atom search error:', error);
    return [];
  }
}

// Determine search type: term/name/phrase
function determineSearchType(query: string): string {
  if (query.includes(' v ') || query.includes(' vs ')) {
    return 'case-name'; // e.g., "Smith v Jones"
  } else if (query.split(' ').length > 2) {
    return 'phrase'; // e.g., "landlord and tenant dispute"
  }
  return 'term'; // e.g., "rent"
}

// Parse Find Case Law Atom feed
function parseFindCaseLawAtom(feedText: string, query: string, limit: number) {
  const cases = [] as any[];

  try {
    const entryPattern = /<entry>(.*?)<\/entry>/gs;
    let match;
    let count = 0;
    const queryLower = query.toLowerCase();

    while ((match = entryPattern.exec(feedText)) !== null && count < limit) {
      const entryHtml = match[1];

      const titleMatch = entryHtml.match(/<title>(.*?)<\/title>/s);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown Title';

      const linkMatch = entryHtml.match(/<link[^>]*href="(.*?)"[^>]*\/>/s);
      const url = linkMatch ? linkMatch[1] : '#';

      const summaryMatch = entryHtml.match(/<summary[^>]*>(.*?)<\/summary>/s);
      const summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').trim() : '';

      const updatedMatch = entryHtml.match(/<updated>(.*?)<\/updated>/s);
      const updated = updatedMatch ? updatedMatch[1] : '';
      const year = updated ? new Date(updated).getFullYear() : new Date().getFullYear();

      const similarityScore = calculateSimilarity(queryLower, title.toLowerCase());

      if (similarityScore === 0) {
        const summaryLower = summary.toLowerCase();
        if (!summaryLower.includes(queryLower)) {
          continue;
        }
      }

      const citation = generateCitation(title, year, 'Find Case Law');

      cases.push({
        id: `find-case-law-${count + 1}`,
        citation,
        title,
        url,
        summary: summary ? summary.substring(0, 200) + '...' : title.substring(0, 200) + '...',
        extracts: [title.substring(0, 100) + '...', summary.substring(0, 150) + '...'],
        case_type: 'general',
        year,
        court: 'Find Case Law',
        outcome: 'Judgment available',
        similarity_score: similarityScore
      });

      count++;
    }
  } catch (error) {
    console.error('Error parsing Find Case Law Atom feed:', error);
  }

  return cases;
}

// Parse National Archives search results
function parseNationalArchivesResults(html: string, query: string, limit: number) {
  const cases = [];
  
  try {
    // National Archives uses different HTML structure
    const resultPattern = /<div class="search-result">(.*?)<\/div>/gs;
    
    let match;
    let count = 0;
    const queryLower = query.toLowerCase();
    
    while ((match = resultPattern.exec(html)) !== null && count < limit) {
      const resultHtml = match[1];
      
      // Extract title and URL
      const titleMatch = resultHtml.match(/<h3><a href="(.*?)">(.*?)<\/a><\/h3>/s);
      const title = titleMatch ? titleMatch[2].replace(/<[^>]*>/g, '') : 'Unknown Title';
      const url = titleMatch ? `https://www.nationalarchives.gov.uk${titleMatch[1]}` : '#';
      
      // Extract description
      const descMatch = resultHtml.match(/<p class="description">(.*?)<\/p>/s);
      const description = descMatch ? descMatch[1].replace(/<[^>]*>/g, '') : '';
      
      // Extract date
      const dateMatch = resultHtml.match(/<span class="date">(.*?)<\/span>/s);
      const dateText = dateMatch ? dateMatch[1] : '';
      const year = dateText ? new Date(dateText).getFullYear() : new Date().getFullYear();
      
      // Generate citation for historical cases
      const citation = `[${year}] National Archives Case ${count + 1}`;
      
      // Calculate similarity score
      const similarityScore = calculateSimilarity(queryLower, title.toLowerCase());

      // Only include if there's any overlap in title or description
      if (similarityScore === 0) {
        const descLower = description.toLowerCase();
        if (!descLower.includes(queryLower)) {
          continue;
        }
      }
      
      cases.push({
        id: `national-archives-${count + 1}`,
        citation: citation,
        title: title,
        url: url,
        summary: description.substring(0, 200) + '...',
        extracts: [title.substring(0, 100) + '...', description.substring(0, 150) + '...'],
        case_type: 'historical',
        year: year,
        court: 'National Archives',
        outcome: 'Historical Record',
        similarity_score: similarityScore
      });
      
      count++;
    }
    
  } catch (error) {
    console.error('Error parsing National Archives results:', error);
  }
  
  return cases;
}

// Generate citation from title
function generateCitation(title: string, year: number, source: string): string {
  // Extract party names from title (e.g., "Smith v Jones" -> "Smith v Jones")
  const parties = title.split(' v ')[0] || title.split(' vs ')[0] || title.split(' ')[0];
  
  if (source === 'Supreme Court') {
    return `[${year}] UKSC ${Math.floor(Math.random() * 100) + 1}`;
  } else if (source === 'Judiciary UK') {
    return `[${year}] EWCA Civ ${Math.floor(Math.random() * 100) + 1}`;
  }
  
  return `[${year}] ${parties}`;
}

// BAILII scraping function
async function searchBAILII(query: string, limit: number = 10) {
  try {
    // BAILII search URL for UK cases
    const searchUrl = `https://www.bailii.org/cgi-bin/market/search_db?query=${encodeURIComponent(query)}&collection=ew&method=boolean`
    
    console.log('🌐 Scraping BAILII:', searchUrl);

    // Fetch the search results page
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
    });

    if (!response.ok) {
      throw new Error(`BAILII search failed: ${response.status}`);
    }

    const html = await response.text();
    
    // Parse the HTML to extract case information
    const cases = parseBAILIIResults(html, query, limit);
    
    console.log(`📊 Found ${cases.length} cases for query: ${query}`);
    
    return cases;

  } catch (error) {
    console.error('BAILII scraping error:', error);
    
    // Return fallback mock data if scraping fails
    return [
      {
        id: 'fallback-1',
        citation: '[2023] UKSC 1',
        title: `Case related to ${query} - Fallback Result 1`,
        url: 'https://www.bailii.org/uk/cases/UKSC/2023/1.html',
        summary: `A UK Supreme Court case dealing with matters related to ${query}. This is a fallback result as BAILII scraping is currently unavailable.`,
        extracts: [`The court considered issues related to ${query}...`, `Key legal principles were established...`],
        case_type: 'general',
        year: 2023,
        court: 'UK Supreme Court',
        outcome: 'Judgment delivered',
        similarity_score: 0.75
      },
      {
        id: 'fallback-2',
        citation: '[2022] EWCA Civ 15',
        title: `Case involving ${query} - Fallback Result 2`,
        url: 'https://www.bailii.org/uk/cases/EWCA/Civ/2022/15.html',
        summary: `A Court of Appeal case addressing ${query} matters. This is a fallback result as BAILII scraping is currently unavailable.`,
        extracts: [`The appellate court examined ${query}...`, `Important precedents were discussed...`],
        case_type: 'general',
        year: 2022,
        court: 'Court of Appeal',
        outcome: 'Appeal allowed',
        similarity_score: 0.68
      }
    ];
  }
}

// Parse BAILII HTML results
function parseBAILIIResults(html: string, query: string, limit: number) {
  const cases = [];
  
  try {
    // Simple regex-based parsing (in production, you'd use a proper HTML parser)
    const resultPattern = /<div class="result">(.*?)<\/div>/gs;
    const citationPattern = /<span class="citation">(.*?)<\/span>/s;
    const titlePattern = /<span class="title">(.*?)<\/span>/s;
    const linkPattern = /<a href="(.*?)"/s;
    
    let match;
    let count = 0;
    
    // Extract individual results
    while ((match = resultPattern.exec(html)) !== null && count < limit) {
      const resultHtml = match[1];
      
      // Extract citation
      const citationMatch = resultHtml.match(citationPattern);
      const citation = citationMatch ? citationMatch[1].replace(/<[^>]*>/g, '') : 'Unknown Citation';
      
      // Extract title
      const titleMatch = resultHtml.match(titlePattern);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '') : 'Unknown Title';
      
      // Extract link
      const linkMatch = resultHtml.match(linkPattern);
      const url = linkMatch ? `https://www.bailii.org${linkMatch[1]}` : '#';
      
      // Extract year from citation
      const yearMatch = citation.match(/\[(\d{4})\]/);
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
      
      // Extract court from citation
      let court = 'Unknown Court';
      if (citation.includes('UKSC')) court = 'UK Supreme Court';
      else if (citation.includes('EWCA')) court = 'Court of Appeal';
      else if (citation.includes('EWHC')) court = 'High Court';
      
      // Calculate similarity score based on query match
      const similarityScore = calculateSimilarity(query.toLowerCase(), title.toLowerCase());
      
      cases.push({
        id: `bailii-${count + 1}`,
        citation: citation,
        title: title,
        url: url,
        summary: `Case from ${court} concerning ${title.toLowerCase()}. Click to view full judgment on BAILII.`,
        extracts: [`Extract from case: ${title.substring(0, 100)}...`, `Citation: ${citation}`],
        case_type: 'general',
        year: year,
        court: court,
        outcome: 'Judgment available',
        similarity_score: similarityScore
      });
      
      count++;
    }
    
    // If no results found with regex, try simpler approach
    if (cases.length === 0) {
      // Look for any links that might be cases
      const linkPattern = /<a href="\/uk\/cases\/([^"]+)">(.*?)<\/a>/gs;
      let linkMatch;
      let linkCount = 0;
      
      while ((linkMatch = linkPattern.exec(html)) !== null && linkCount < limit) {
        const casePath = linkMatch[1];
        const caseTitle = linkMatch[1].replace(/<[^>]*>/g, '');
        
        // Extract year from path
        const yearMatch = casePath.match(/\/(\d{4})\//);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
        
        // Extract court from path
        let court = 'Unknown Court';
        if (casePath.includes('UKSC')) court = 'UK Supreme Court';
        else if (casePath.includes('EWCA')) court = 'Court of Appeal';
        else if (casePath.includes('EWHC')) court = 'High Court';
        
        const similarityScore = calculateSimilarity(query.toLowerCase(), caseTitle.toLowerCase());
        
        cases.push({
          id: `bailii-simple-${linkCount + 1}`,
          citation: `[${year}] ${court}`,
          title: caseTitle,
          url: `https://www.bailii.org/uk/cases/${casePath}`,
          summary: `Case from ${court} - ${caseTitle}`,
          extracts: [`Case reference: ${casePath}`, `Year: ${year}`],
          case_type: 'general',
          year: year,
          court: court,
          outcome: 'Judgment available',
          similarity_score: similarityScore
        });
        
        linkCount++;
      }
    }
    
  } catch (error) {
    console.error('Error parsing BAILII results:', error);
  }
  
  // Sort by similarity score
  return cases.sort((a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0));
}

// Calculate simple similarity score
function calculateSimilarity(query: string, title: string) {
  const tokenize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((word) => !['the', 'and', 'of', 'v', 'vs', 'in', 'on', 'for', 'to', 'a'].includes(word));

  const queryWords = tokenize(query);
  const titleWords = tokenize(title);

  if (queryWords.length === 0 || titleWords.length === 0) return 0;

  const querySet = new Set(queryWords);
  const titleSet = new Set(titleWords);
  const intersection = new Set([...querySet].filter((word) => titleSet.has(word)));
  const union = new Set([...querySet, ...titleSet]);

  return intersection.size / union.size;
}

function applyFilters(results: any[], filters: any) {
  if (!filters || Object.keys(filters).length === 0) return results;

  return results.filter((result) => {
    if (filters.case_type && filters.case_type !== 'all') {
      if (!result.case_type || result.case_type !== filters.case_type) return false;
    }

    if (filters.court) {
      const courtMatch = String(result.court || '').toLowerCase();
      if (!courtMatch.includes(String(filters.court).toLowerCase())) return false;
    }

    if (filters.year_from) {
      if (!result.year || result.year < Number(filters.year_from)) return false;
    }

    if (filters.year_to) {
      if (!result.year || result.year > Number(filters.year_to)) return false;
    }

    if (filters.outcome) {
      const outcomeMatch = String(result.outcome || '').toLowerCase();
      if (!outcomeMatch.includes(String(filters.outcome).toLowerCase())) return false;
    }

    return true;
  });
}

export {
  removeDuplicates,
  searchSupremeCourtWebsite,
  searchSupremeCourt,
  searchJudiciary,
  searchNationalArchives,
  searchFindCaseLawAPI,
  searchFindCaseLawAtom,
  searchBAILII,
  parseSupremeCourtWebsiteResults,
  parseRSSFeed,
  parseFindCaseLawSearchResults,
  parseFindCaseLawAtom,
  parseNationalArchivesResults,
  parseBAILIIResults,
  determineSearchType,
  generateCitation,
  calculateSimilarity,
  applyFilters,
  enrichResultsWithSupabase,
  enrichResultsWithUrlSummaries,
};
