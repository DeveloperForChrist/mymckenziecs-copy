import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export const runtime = 'nodejs'

const uploadDir = path.join(os.tmpdir(), 'mymckenzie-chat-uploads')

const isSafeId = (value: string) => /^[a-zA-Z0-9_\-]+$/.test(value)

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id || !isSafeId(id)) {
      return NextResponse.json({ message: 'Invalid download id.' }, { status: 400 })
    }

    const metaPath = path.join(uploadDir, `${id}.json`)
    const metaRaw = await fs.readFile(metaPath, 'utf-8')
    const meta = JSON.parse(metaRaw) as {
      mimeType: string
      filename: string
    }
    const filePath = path.join(uploadDir, meta.filename)
    const buffer = await fs.readFile(filePath)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': meta.mimeType || 'application/octet-stream'
      }
    })
  } catch {
    return NextResponse.json({ message: 'File not found or expired.' }, { status: 404 })
  }
}
