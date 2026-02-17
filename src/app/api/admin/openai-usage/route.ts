import { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAdminSession } from '@/lib/auth/admin-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  const admin = await requireAdminSession();
  if (!admin.ok) return admin.response;
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
