/**
 * Utility functions for case study content processing and analysis
 * @module case-study-utils
 */

export interface PaginatedContent {
  page: number;
  content: string;
  totalPages: number;
}

export interface ContentStatistics {
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  averageWordsPerSentence: number;
  readingTimeMinutes: number;
}

/**
 * Paginate text content into chunks by word count
 * @param content - The full text content to paginate
 * @param wordsPerPage - Number of words per page (default: 500)
 * @returns Array of paginated content objects
 */
export function paginateContent(content: string, wordsPerPage: number = 500): PaginatedContent[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const countWords = (text: string) => text.split(/\s+/).filter((word) => word.length > 0).length;

  const splitLongParagraph = (paragraph: string): string[] => {
    const maxChunkWords = Math.max(60, Math.floor(wordsPerPage * 0.75));
    if (countWords(paragraph) <= maxChunkWords) return [paragraph];

    const sentences = paragraph
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
      .map((s) => s.trim())
      .filter(Boolean);

    // Fallback if sentence splitting fails
    if (sentences.length <= 1) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      const chunks: string[] = [];
      for (let i = 0; i < words.length; i += maxChunkWords) {
        chunks.push(words.slice(i, i + maxChunkWords).join(' '));
      }
      return chunks;
    }

    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentWords = 0;

    for (const sentence of sentences) {
      const sentenceWords = countWords(sentence);
      if (currentWords > 0 && currentWords + sentenceWords > maxChunkWords) {
        chunks.push(currentChunk.join(' ').trim());
        currentChunk = [sentence];
        currentWords = sentenceWords;
      } else {
        currentChunk.push(sentence);
        currentWords += sentenceWords;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' ').trim());
    }

    return chunks;
  };

  const paragraphs = content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks = paragraphs.flatMap((paragraph) => splitLongParagraph(paragraph));
  const pages: string[] = [];
  let currentBlocks: string[] = [];
  let currentWordCount = 0;

  for (const block of blocks) {
    const blockWords = countWords(block);

    if (currentWordCount > 0 && currentWordCount + blockWords > wordsPerPage) {
      pages.push(currentBlocks.join('\n\n').trim());
      currentBlocks = [block];
      currentWordCount = blockWords;
    } else {
      currentBlocks.push(block);
      currentWordCount += blockWords;
    }
  }

  if (currentBlocks.length > 0) {
    pages.push(currentBlocks.join('\n\n').trim());
  }

  // Avoid tiny orphan last page by moving the last block from previous page.
  if (pages.length >= 2) {
    const lastPageWords = countWords(pages[pages.length - 1]);
    const minLastPageWords = Math.floor(wordsPerPage * 0.35);
    if (lastPageWords > 0 && lastPageWords < minLastPageWords) {
      const prevBlocks = pages[pages.length - 2].split(/\n{2,}/).filter(Boolean);
      if (prevBlocks.length > 1) {
        const movedBlock = prevBlocks.pop() as string;
        const newLast = `${movedBlock}\n\n${pages[pages.length - 1]}`.trim();
        pages[pages.length - 2] = prevBlocks.join('\n\n').trim();
        pages[pages.length - 1] = newLast;
      }
    }
  }

  const totalPages = pages.length;
  return pages.map((pageContent, index) => ({
    page: index + 1,
    content: pageContent,
    totalPages,
  }));
}

/**
 * Calculate comprehensive statistics for text content
 * @param content - The text content to analyze
 * @returns Statistics object with various metrics
 */
export function analyzeContentStatistics(content: string): ContentStatistics {
  if (!content || content.trim().length === 0) {
    return {
      wordCount: 0,
      characterCount: 0,
      sentenceCount: 0,
      paragraphCount: 0,
      averageWordsPerSentence: 0,
      readingTimeMinutes: 0
    };
  }

  const words = content.split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;
  const characterCount = content.length;
  
  // Count sentences (simple heuristic)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;
  
  // Count paragraphs (by double newlines or significant breaks)
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const paragraphCount = paragraphs.length;
  
  // Calculate average words per sentence
  const averageWordsPerSentence = sentenceCount > 0 
    ? Math.round(wordCount / sentenceCount * 10) / 10 
    : 0;
  
  // Estimate reading time (assuming 200 words per minute average reading speed)
  const readingTimeMinutes = Math.ceil(wordCount / 200);
  
  return {
    wordCount,
    characterCount,
    sentenceCount,
    paragraphCount,
    averageWordsPerSentence,
    readingTimeMinutes
  };
}

/**
 * Extract section headings from case study content
 * @param content - The case study text
 * @returns Array of section heading objects with titles and positions
 */
export function extractSections(content: string): Array<{ title: string; position: number }> {
  const sections: Array<{ title: string; position: number }> = [];
  const lines = content.split('\n');
  
  let currentPosition = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Match all-caps headings (e.g., "CASE SUMMARY")
    if (/^[A-Z][A-Z\s]{2,}$/.test(trimmed) && trimmed.length > 3 && trimmed.length < 50) {
      sections.push({
        title: trimmed,
        position: currentPosition
      });
    }
    // Match numbered sections (e.g., "1. CASE OVERVIEW")
    else if (/^\d+\.\s+[A-Z]/.test(trimmed)) {
      sections.push({
        title: trimmed,
        position: currentPosition
      });
    }
    
    currentPosition += line.length + 1; // +1 for newline
  }
  
  return sections;
}

/**
 * Calculate a quality score for case study content
 * @param content - The case study content
 * @returns Score from 0-100 indicating content quality
 */
export function calculateContentQuality(content: string): number {
  if (!content || content.trim().length === 0) return 0;
  
  let score = 0;
  const stats = analyzeContentStatistics(content);
  const sections = extractSections(content);
  
  // Word count score (max 30 points)
  if (stats.wordCount >= 3000) score += 30;
  else if (stats.wordCount >= 2000) score += 20;
  else if (stats.wordCount >= 1000) score += 10;
  
  // Section structure score (max 30 points)
  const expectedSections = ['CASE SUMMARY', 'CASE OVERVIEW', 'LEGAL PRINCIPLES', 'LEARNING POINTS'];
  const foundSections = sections.filter(s => 
    expectedSections.some(expected => s.title.includes(expected))
  );
  score += Math.min(30, foundSections.length * 10);
  
  // Readability score (max 20 points)
  if (stats.averageWordsPerSentence >= 15 && stats.averageWordsPerSentence <= 25) {
    score += 20; // Optimal sentence length
  } else if (stats.averageWordsPerSentence >= 10 && stats.averageWordsPerSentence <= 30) {
    score += 10; // Acceptable sentence length
  }
  
  // Paragraph structure score (max 20 points)
  const wordsPerParagraph = stats.paragraphCount > 0 
    ? stats.wordCount / stats.paragraphCount 
    : 0;
  if (wordsPerParagraph >= 50 && wordsPerParagraph <= 150) {
    score += 20; // Well-structured paragraphs
  } else if (wordsPerParagraph >= 30 && wordsPerParagraph <= 200) {
    score += 10; // Acceptable paragraphs
  }
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Estimate the educational value level of case study content
 * @param content - The case study content
 * @returns Educational value level: 'basic', 'intermediate', or 'comprehensive'
 */
export function assessEducationalValue(content: string): 'basic' | 'intermediate' | 'comprehensive' {
  const stats = analyzeContentStatistics(content);
  const quality = calculateContentQuality(content);
  
  if (stats.wordCount >= 3000 && quality >= 70) {
    return 'comprehensive';
  } else if (stats.wordCount >= 1500 && quality >= 50) {
    return 'intermediate';
  } else {
    return 'basic';
  }
}
