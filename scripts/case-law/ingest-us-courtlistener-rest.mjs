#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const COURTLISTENER_SEARCH_URL = 'https://www.courtlistener.com/api/rest/v4/search/';
const DEFAULT_QUERIES = [
  'contract dispute',
  'consumer protection',
  'landlord tenant',
  'family law custody',
  'small claims',
  'negligence',
  'employment discrimination',
  'criminal appeal',
];
const DEFAULT_FEDERAL_COURTS = ['scotus', 'ca1', 'ca2', 'ca3', 'ca4', 'ca5', 'ca6', 'ca7', 'ca8', 'ca9', 'ca10', 'ca11', 'cadc'];

const args = parseArgs(process.argv.slice(2));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const parsed = {
    collection: process.env.MILVUS_US_COLLECTION || 'case_law_us',
    maxRecords: Number(process.env.US_CASE_LAW_MAX_RECORDS || 10),
    pageSize: Number(process.env.COURTLISTENER_PAGE_SIZE || 10),
    queries: [],
    courts: [],
    federalSeed: false,
    dryRun: false,
    sleepSeconds: Number(process.env.COURTLISTENER_SLEEP_SECONDS || 1.2),
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    vectorDim: Number(process.env.VECTOR_DIM || 1536),
    snapshot: '.data/bronze/case-law-us/courtlistener-rest-seed.jsonl',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--collection' && next) parsed.collection = next, index += 1;
    else if (arg === '--max-records' && next) parsed.maxRecords = Number(next), index += 1;
    else if (arg === '--page-size' && next) parsed.pageSize = Number(next), index += 1;
    else if (arg === '--query' && next) parsed.queries.push(next), index += 1;
    else if (arg === '--court' && next) parsed.courts.push(next), index += 1;
    else if (arg === '--federal-seed') parsed.federalSeed = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--sleep-seconds' && next) parsed.sleepSeconds = Number(next), index += 1;
    else if (arg === '--snapshot' && next) parsed.snapshot = next, index += 1;
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(parsed.maxRecords) || parsed.maxRecords <= 0) {
    throw new Error('--max-records must be a positive number');
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/case-law/ingest-us-courtlistener-rest.mjs --dry-run --max-records 5
  node scripts/case-law/ingest-us-courtlistener-rest.mjs --max-records 10

Environment:
  OPENAI_API_KEY           required for non-dry-run embeddings
  ZILLIZ_API_KEY           required for non-dry-run REST writes
  MILVUS_HOST              existing Zilliz host, or use US_MILVUS_HOST for a separate cluster
  US_MILVUS_HOST           optional separate U.S. Zilliz host
  MILVUS_US_COLLECTION     defaults to case_law_us`);
}

function cleanText(value, maxChars = 65000) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function stableId(result, opinion) {
  const source = String(opinion?.id || result.cluster_id || result.absolute_url || result.caseNameFull || '');
  return `courtlistener-${crypto.createHash('sha1').update(source).digest('hex').slice(0, 24)}`;
}

function citationString(result) {
  if (Array.isArray(result.citation)) return result.citation.map(String).filter(Boolean).join('; ').slice(0, 512);
  return cleanText(result.citation, 512);
}

function jurisdictionFor(result) {
  const courtId = String(result.court_id || '').toLowerCase();
  if (courtId === 'scotus' || courtId === 'cadc' || /^ca\d+$/.test(courtId)) return 'US-FED';
  return 'US';
}

function resultToRecord(result) {
  const opinion = Array.isArray(result.opinions) ? result.opinions[0] : null;
  const title = cleanText(result.caseNameFull || result.caseName, 2048);
  const snippet = cleanText(opinion?.snippet || result.snippet || result.syllabus || '');
  if (!title || !snippet) return null;

  const absoluteUrl = String(result.absolute_url || '');
  const url = absoluteUrl.startsWith('/') ? `https://www.courtlistener.com${absoluteUrl}` : absoluteUrl;
  const citation = citationString(result);
  const court = cleanText(result.court, 1024);
  const summary = cleanText([
    title,
    citation,
    court,
    result.status,
    result.procedural_history,
    result.posture,
    snippet,
  ].filter(Boolean).join(' | '));

  return {
    id: stableId(result, opinion),
    citation,
    title,
    url: cleanText(url, 2048),
    summary,
    extracts: snippet,
    court,
    court_id: cleanText(result.court_id, 128),
    jurisdiction: jurisdictionFor(result),
    decision_date: cleanText(result.dateFiled, 64),
    docket_number: cleanText(result.docketNumber, 256),
    source_provider: 'courtlistener',
    source_id: cleanText(result.cluster_id, 128),
    precedential_status: cleanText(result.status || 'Published', 128),
  };
}

async function courtListenerFetch(url) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'MyMcKenzieCS-US-case-law-ingester/0.1',
  };
  const token = process.env.COURTLISTENER_API_TOKEN || process.env.COURTLISTENER_TOKEN;
  if (token) headers.Authorization = `Token ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`CourtListener HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  if (args.sleepSeconds > 0) await sleep(args.sleepSeconds * 1000);
  return response.json();
}

function searchUrl(query, court, nextUrl) {
  if (nextUrl) return nextUrl;
  const params = new URLSearchParams({
    type: 'o',
    q: query,
    highlight: 'off',
    stat_Precedential: 'on',
    page_size: String(args.pageSize),
  });
  if (court) params.set('court', court);
  return `${COURTLISTENER_SEARCH_URL}?${params.toString()}`;
}

async function collectRecords() {
  const records = [];
  const seen = new Set();
  const queries = args.queries.length ? args.queries : DEFAULT_QUERIES;
  const courts = args.federalSeed ? (args.courts.length ? args.courts : DEFAULT_FEDERAL_COURTS) : (args.courts.length ? args.courts : [null]);

  for (const court of courts) {
    for (const query of queries) {
      let nextUrl = null;
      while (records.length < args.maxRecords) {
        const payload = await courtListenerFetch(searchUrl(query, court, nextUrl));
        for (const result of payload.results || []) {
          const record = resultToRecord(result);
          if (!record || seen.has(record.id)) continue;
          seen.add(record.id);
          records.push(record);
          if (records.length >= args.maxRecords) break;
        }
        nextUrl = payload.next;
        if (!nextUrl || records.length >= args.maxRecords) break;
      }
    }
  }
  return records;
}

function writeSnapshot(records) {
  const target = path.resolve(args.snapshot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  return target;
}

function zillizBaseUrl() {
  const host = process.env.US_MILVUS_HOST || process.env.MILVUS_US_HOST || process.env.MILVUS_HOST;
  if (!host) throw new Error('MILVUS_HOST or US_MILVUS_HOST is required for Zilliz REST writes');
  const normalized = host.startsWith('http') ? host : `https://${host}`;
  return normalized.replace(/\/+$/, '');
}

function zillizToken() {
  const token = process.env.US_ZILLIZ_API_KEY || process.env.ZILLIZ_US_API_KEY || process.env.ZILLIZ_API_KEY;
  if (!token) throw new Error('ZILLIZ_API_KEY or US_ZILLIZ_API_KEY is required for Zilliz REST writes');
  return token;
}

async function zillizRequest(pathname, body, { allowAlreadyExists = false } = {}) {
  const response = await fetch(`${zillizBaseUrl()}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${zillizToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok || (payload.code && payload.code !== 0)) {
    const message = String(payload.message || payload.msg || text || '');
    if (allowAlreadyExists && /exist|duplicate|already/i.test(message)) return payload;
    throw new Error(`Zilliz REST ${response.status}: ${message.slice(0, 700)}`);
  }
  return payload;
}

async function ensureCollection() {
  await zillizRequest('/v2/vectordb/collections/create', {
    collectionName: args.collection,
    dimension: args.vectorDim,
    metricType: 'COSINE',
    idType: 'VarChar',
    primaryFieldName: 'id',
    vectorFieldName: 'embedding',
    autoID: false,
    enableDynamicField: true,
    description: 'U.S. case law vectors from CourtListener for MyMcKenzieCS',
    params: { max_length: 128 },
  }, { allowAlreadyExists: true });
}

function embeddingText(record) {
  return [record.title, record.citation, record.court, record.jurisdiction, record.summary, record.extracts]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 24000);
}

async function insertRecords(records) {
  if (!records.length) return;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for embeddings');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await ensureCollection();

  const response = await openai.embeddings.create({
    model: args.embeddingModel,
    input: records.map(embeddingText),
  });
  const entities = records.map((record, index) => ({
    ...record,
    embedding: response.data[index].embedding,
  }));

  await zillizRequest('/v2/vectordb/entities/upsert', {
    collectionName: args.collection,
    data: entities,
  });
  console.log(`Upserted ${entities.length} records into ${args.collection}`);
}

console.log(`Collecting up to ${args.maxRecords} U.S. case-law records from CourtListener...`);
const records = await collectRecords();
const snapshot = writeSnapshot(records);
console.log(`Collected ${records.length} records. Snapshot: ${snapshot}`);

for (const record of records.slice(0, 5)) {
  console.log(`- ${record.title} | ${record.court} | ${record.decision_date} | ${record.url}`);
}

if (args.dryRun) {
  console.log('Dry run complete; no embeddings generated and no Zilliz writes performed.');
} else {
  await insertRecords(records);
}
