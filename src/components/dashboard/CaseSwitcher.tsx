'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';

type CaseRecord = {
  id: string;
  caseType?: string;
  title?: string;
  caseNumber?: string;
  status?: string;
};

// Case switching UI removed — feature disabled.
export default function CaseSwitcher() {
  return null;
}
