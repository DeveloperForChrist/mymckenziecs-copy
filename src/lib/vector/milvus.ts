import OpenAI from 'openai';
import { spawn } from 'child_process';
import path from 'path';
import type { UserLegalContext } from '@/lib/legal/jurisdictions';
import { getUnitedStatesJurisdictionTarget, isUnitedStatesContext } from '@/lib/legal/jurisdictions';

let cachedOpenAI: OpenAI | null = null;

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY env var');
  }
  cachedOpenAI ??= new OpenAI({ apiKey });
  return cachedOpenAI;
};

let pythonMilvusCheckComplete = false;
let pythonMilvusAvailable = true;
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';

const MILVUS_DEPENDENCY_MISSING_PREFIX = 'MILVUS_DEPENDENCY_MISSING';

type VectorSearchOptions = {
  legalContext?: UserLegalContext | null;
  collection?: string;
};

type UsJurisdictionTarget = NonNullable<ReturnType<typeof getUnitedStatesJurisdictionTarget>>;

const trimProtocol = (value: string) => value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

const getMilvusRestConfig = (options?: VectorSearchOptions) => {
  const useUs = isUnitedStatesContext(options?.legalContext);
  const host = useUs
    ? (process.env.US_MILVUS_HOST || process.env.MILVUS_US_HOST || process.env.MILVUS_HOST)
    : process.env.MILVUS_HOST;
  const token = useUs
    ? (process.env.US_ZILLIZ_API_KEY || process.env.ZILLIZ_US_API_KEY || process.env.ZILLIZ_API_KEY)
    : process.env.ZILLIZ_API_KEY;
  const collection = options?.collection || (useUs
    ? (process.env.MILVUS_US_COLLECTION || 'case_law_us')
    : (process.env.MILVUS_COLLECTION || 'case_law'));

  if (!host || !token) return null;

  return {
    baseUrl: `https://${trimProtocol(host)}`,
    token,
    collection,
  };
};

const normalizeZillizSearchResults = (payload: any): any[] => {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.map((item: any) => {
    const entity = item?.entity && typeof item.entity === 'object' ? item.entity : item;
    const id = String(item?.id || entity?.id || '');
    return {
      id,
      score: Number(item?.distance ?? item?.score ?? 0),
      citation: entity?.citation || null,
      title: entity?.title || null,
      url: entity?.url || null,
      summary: entity?.summary || null,
      extracts: entity?.extracts || null,
      court: entity?.court || null,
      jurisdiction: entity?.jurisdiction || null,
      decision_date: entity?.decision_date || null,
      court_id: entity?.court_id || null,
      source_provider: entity?.source_provider || null,
      precedential_status: entity?.precedential_status || null,
    };
  });
};

const normalizeTextForMatching = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const FEDERAL_CIRCUIT_LABEL_BY_ID: Record<string, string> = {
  ca1: 'first circuit',
  ca2: 'second circuit',
  ca3: 'third circuit',
  ca4: 'fourth circuit',
  ca5: 'fifth circuit',
  ca6: 'sixth circuit',
  ca7: 'seventh circuit',
  ca8: 'eighth circuit',
  ca9: 'ninth circuit',
  ca10: 'tenth circuit',
  ca11: 'eleventh circuit',
  cadc: 'district of columbia circuit',
};

const isSameUsStateAuthority = (result: any, target: UsJurisdictionTarget) => {
  const jurisdiction = normalizeTextForMatching(result?.jurisdiction);
  const court = normalizeTextForMatching(result?.court);
  const courtId = normalizeTextForMatching(result?.court_id);
  const state = normalizeTextForMatching(target.label);
  const abbreviation = normalizeTextForMatching(target.abbreviation);
  const jurisdictionCode = normalizeTextForMatching(target.code);

  return (
    jurisdiction === jurisdictionCode ||
    jurisdiction === abbreviation ||
    jurisdiction === `us ${abbreviation}` ||
    court.includes(state) ||
    courtId === abbreviation ||
    courtId === jurisdictionCode ||
    courtId.startsWith(`${abbreviation} `)
  );
};

const isRelevantFederalAuthority = (result: any, target: UsJurisdictionTarget) => {
  const jurisdiction = normalizeTextForMatching(result?.jurisdiction);
  const court = normalizeTextForMatching(result?.court);
  const courtId = normalizeTextForMatching(result?.court_id);
  const circuit = normalizeTextForMatching(target.federalCircuit);
  const circuitLabel = normalizeTextForMatching(FEDERAL_CIRCUIT_LABEL_BY_ID[target.federalCircuit || '']);

  return (
    jurisdiction === 'us fed' ||
    courtId === 'scotus' ||
    court.includes('supreme court of the united states') ||
    (Boolean(circuit) && courtId === circuit) ||
    (Boolean(circuitLabel) && court.includes(circuitLabel))
  );
};

const applyUsStateAuthorityPreference = (results: any[], options?: VectorSearchOptions) => {
  const target = getUnitedStatesJurisdictionTarget(options?.legalContext);
  if (!target || results.length === 0) return results;

  const sameState = results.filter((result) => isSameUsStateAuthority(result, target));
  const federal = results.filter(
    (result) => !isSameUsStateAuthority(result, target) && isRelevantFederalAuthority(result, target)
  );

  if (sameState.length > 0) {
    return [...sameState, ...federal];
  }

  return federal.length > 0 ? federal : [];
};

const buildJurisdictionAwareVectorQuery = (text: string, options?: VectorSearchOptions) => {
  const target = getUnitedStatesJurisdictionTarget(options?.legalContext);
  if (!target) return text;

  return `${target.label} ${target.abbreviation} ${text}`;
};

async function searchZillizRestByEmbedding(
  embedding: number[],
  topk: number = 5,
  options?: VectorSearchOptions
): Promise<any[] | null> {
  const config = getMilvusRestConfig(options);
  if (!config) return null;

  const response = await fetch(`${config.baseUrl}/v2/vectordb/entities/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      collectionName: config.collection,
      data: [embedding],
      limit: topk,
      outputFields: [
        'id',
        'citation',
        'title',
        'url',
        'summary',
        'extracts',
        'court',
        'court_id',
        'jurisdiction',
        'decision_date',
        'source_provider',
        'precedential_status',
      ],
    }),
  });

  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }

  if (!response.ok || (payload?.code && payload.code !== 0)) {
    throw new Error(`Zilliz REST search failed: ${payload?.message || payload?.msg || text || response.statusText}`);
  }

  return normalizeZillizSearchResults(payload);
}

const isMissingPymilvusError = (message: string) =>
  /no module named ['"]pymilvus['"]/i.test(message);

const ensurePythonMilvusAvailable = async (): Promise<boolean> => {
  if (pythonMilvusCheckComplete) return pythonMilvusAvailable;

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(PYTHON_BIN, ['-c', 'import pymilvus'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr || `Python exited with code ${code}`));
      });
    });
    pythonMilvusAvailable = true;
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (isMissingPymilvusError(message)) {
      console.warn('pymilvus is not installed; vector fallback to Python helper is disabled.');
    } else {
      console.warn('Python Milvus availability check failed:', message);
    }
    pythonMilvusAvailable = false;
  } finally {
    pythonMilvusCheckComplete = true;
  }

  return pythonMilvusAvailable;
};

export async function embedText(text: string): Promise<number[]> {
  const resp = await getOpenAI().embeddings.create({ model: 'text-embedding-3-small', input: text });
  return resp.data[0].embedding as number[];
}

const PY_BRIDGE_URL = process.env.PY_BRIDGE_URL || 'http://127.0.0.1:8000';

export async function searchVectorsByEmbedding(
  embedding: number[],
  topk: number = 5,
  options?: VectorSearchOptions
): Promise<any[]> {
  const restResults = await searchZillizRestByEmbedding(embedding, topk, options);
  if (restResults) return applyUsStateAuthorityPreference(restResults, options).slice(0, topk);

  // Prefer the HTTP bridge for persistent, lower-latency queries.
  try {
    const res = await fetch(`${PY_BRIDGE_URL}/search_embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embedding, topk }),
    });
    if (res.ok) {
      return await res.json();
    } else {
      const txt = await res.text().catch(() => '');
      console.warn('Python bridge HTTP error', res.status, txt);
    }
  } catch (err) {
    // likely connection refused — fall back to spawning the helper per-request
  }

  const hasPythonMilvus = await ensurePythonMilvusAvailable();
  if (!hasPythonMilvus) {
    throw new Error(`${MILVUS_DEPENDENCY_MISSING_PREFIX}: pymilvus is not installed on this runtime`);
  }

  // Exec fallback (existing script).
  const pyPath = path.join(process.cwd(), 'scripts', 'case-law', 'search_milvus.py');
  const payload = JSON.stringify({ embedding, topk });

  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(PYTHON_BIN, [pyPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(stderr || `Python exited with code ${code}`));
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
    if (stderr.trim().length) console.warn('Python Milvus helper stderr:', stderr);
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    const message = String(err?.message || err || '');
    if (isMissingPymilvusError(message)) {
      pythonMilvusCheckComplete = true;
      pythonMilvusAvailable = false;
      throw new Error(`${MILVUS_DEPENDENCY_MISSING_PREFIX}: ${message}`);
    }
    throw new Error('Python Milvus bridge failed: ' + message);
  }
}

export async function searchByText(text: string, topk: number = 5, options?: VectorSearchOptions): Promise<any[]> {
  const restConfig = getMilvusRestConfig(options);
  if (restConfig) {
    const emb = await embedText(buildJurisdictionAwareVectorQuery(text, options));
    return searchVectorsByEmbedding(emb, Math.max(topk * 6, 30), options).then((results) => results.slice(0, topk));
  }

  // Try HTTP bridge with text first (it will embed + search server-side).
  try {
    const res = await fetch(`${PY_BRIDGE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, topk }),
    });
    if (res.ok) {
      const results = await res.json();
      return applyUsStateAuthorityPreference(Array.isArray(results) ? results : [], options).slice(0, topk);
    }
  } catch (err) {
    // ignore and fall back
  }

  const hasPythonMilvus = await ensurePythonMilvusAvailable();
  if (!hasPythonMilvus) {
    throw new Error(`${MILVUS_DEPENDENCY_MISSING_PREFIX}: pymilvus is not installed on this runtime`);
  }

  const emb = await embedText(text);
  return searchVectorsByEmbedding(emb, topk, options);
}
