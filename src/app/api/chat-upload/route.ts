import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

export const runtime = 'nodejs'

const uploadDir = path.join(os.tmpdir(), 'mymckenzie-chat-uploads')

const sanitizeFilename = (value: string) => {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  return trimmed.replace(/[^a-zA-Z0-9._\- ]/g, '').trim() || 'uploaded-document'
}

const ensureUploadDir = async () => {
  await fs.mkdir(uploadDir, { recursive: true })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const entries = formData.getAll('files')
    if (!entries.length) {
      return NextResponse.json({ message: 'No files provided.' }, { status: 400 })
    }

    await ensureUploadDir()

    const uploads = await Promise.all(
      entries.map(async (entry) => {
        if (!(entry instanceof File)) return null
        const safeName = sanitizeFilename(entry.name)
        const id = `tmp_${randomUUID()}`
        const filename = `${id}--${safeName}`
        const filePath = path.join(uploadDir, filename)
        const metaPath = path.join(uploadDir, `${id}.json`)
        const buffer = Buffer.from(await entry.arrayBuffer())
        await fs.writeFile(filePath, buffer)
        await fs.writeFile(
          metaPath,
          JSON.stringify(
            {
              id,
              name: safeName,
              mimeType: entry.type || 'application/octet-stream',
              size: buffer.length,
              filename,
              createdAt: new Date().toISOString()
            },
            null,
            2
          )
        )

        return {
          name: safeName,
          downloadURL: `/api/chat-upload/${id}`,
          storagePath: id,
          size: buffer.length,
          mimeType: entry.type || null
        }
      })
    )

    const files = uploads.filter(Boolean)
    return NextResponse.json({ files }, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ message }, { status: 500 })
  }
}
