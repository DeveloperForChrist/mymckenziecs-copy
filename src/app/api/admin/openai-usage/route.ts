import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  // Only allow admin (simple header check)
  if (req.headers.get('x-admin-auth') !== 'true') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const logPath = path.join(process.cwd(), 'data/logs/openai-usage.log.jsonl');
  try {
    const data = fs.readFileSync(logPath, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);
    const entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    // Optionally, limit to last 200 entries
    const recent = entries.slice(-200).reverse();
    return new Response(JSON.stringify({ usage: recent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ usage: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
