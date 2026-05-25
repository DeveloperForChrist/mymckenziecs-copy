import OpenAI from 'openai';
import { spawn } from 'child_process';
import path from 'path';

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

export async function searchVectorsByEmbedding(embedding: number[], topk: number = 5): Promise<any[]> {
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

export async function searchByText(text: string, topk: number = 5): Promise<any[]> {
  // Try HTTP bridge with text first (it will embed + search server-side).
  try {
    const res = await fetch(`${PY_BRIDGE_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, topk }),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    // ignore and fall back
  }

  const hasPythonMilvus = await ensurePythonMilvusAvailable();
  if (!hasPythonMilvus) {
    throw new Error(`${MILVUS_DEPENDENCY_MISSING_PREFIX}: pymilvus is not installed on this runtime`);
  }

  const emb = await embedText(text);
  return searchVectorsByEmbedding(emb, topk);
}
