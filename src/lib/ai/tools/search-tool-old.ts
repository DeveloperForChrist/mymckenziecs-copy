// This file is deprecated and should not be used
// It is kept for reference only

import { Tool } from "@langchain/core/tools";

export type RetrievalMode = 'education' | 'procedure' | 'case_specific' | 'document_review' | 'general'

export type SearchToolInput = {
  query: string
  mode?: RetrievalMode
}

export type SearchToolOutput = {
  query: string
  mode: RetrievalMode
  reviewedCount: number
  sources: string[]
  packet: string
}

// STUB - This tool is deprecated
export class SearchTool extends Tool {
  name = "legal_search";
  description = "Deprecated search tool - do not use";

  async _call(input: string): Promise<string> {
    return JSON.stringify({ error: 'This tool is deprecated' });
  }
}
