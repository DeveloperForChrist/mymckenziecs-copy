import OpenAI from 'openai';
import { spawn } from 'child_process';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedText(text: string): Promise<number[]> {
  const resp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text });
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

  // Exec fallback (existing script).
  const pyPath = path.join(process.cwd(), 'scripts', 'case-law', 'search_milvus.py');
  const payload = JSON.stringify({ embedding, topk });

  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn('python3', [pyPath], { stdio: ['pipe', 'pipe', 'pipe'] });
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
    throw new Error('Python Milvus bridge failed: ' + (err?.message || String(err)));
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

  const emb = await embedText(text);
  return searchVectorsByEmbedding(emb, topk);
}
