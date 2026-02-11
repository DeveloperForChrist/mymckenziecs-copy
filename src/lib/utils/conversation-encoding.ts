import { deflateSync, inflateSync } from 'zlib';

function safeBuffer(input: string) {
  return Buffer.from(input, 'utf-8');
}

export function compressConversationChunk(input: string): string {
  if (!input) return '';
  const compressed = deflateSync(safeBuffer(input), { level: 9 });
  return compressed.toString('base64');
}

export function decompressConversationChunk(encoded?: string | null): string {
  if (!encoded) return '';
  try {
    const buffer = Buffer.from(encoded, 'base64');
    const inflated = inflateSync(buffer);
    return inflated.toString('utf-8');
  } catch (error) {
    console.error('Decompression failed, returning summary fallback', error);
    return '';
  }
}
