import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs'

const PROFILE_MEDIA_BUCKET = 'professional-profile-media'
const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

function normaliseKind(value: FormDataEntryValue | null): 'profile' | 'cover' {
  return value === 'cover' ? 'cover' : 'profile'
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user

    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ message: 'No image provided.' }, { status: 400 })
    }

    const contentType = file.type || 'application/octet-stream'
    const extension = ALLOWED_IMAGE_TYPES.get(contentType)

    if (!extension) {
      return NextResponse.json({ message: 'Please upload a JPG, PNG, WebP, or GIF image.' }, { status: 400 })
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ message: 'Image too large. Maximum size is 5MB.' }, { status: 400 })
    }

    const kind = normaliseKind(formData.get('kind'))
    const storagePath = `${user.id}/${kind}-${Date.now()}-${randomUUID()}.${extension}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabaseAdmin.storage
      .from(PROFILE_MEDIA_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      })

    if (uploadError) {
      console.error('Profile image upload failed', uploadError)
      return NextResponse.json({ message: 'Image upload failed.' }, { status: 500 })
    }

    const publicUrl = supabaseAdmin.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(storagePath).data.publicUrl
    const column = kind === 'cover' ? 'cover_image_url' : 'profile_image_url'

    const { error: updateError } = await supabaseAdmin
      .from('professional_profiles')
      .upsert(
        {
          owner_id: user.id,
          [column]: publicUrl,
          email: user.email || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id' }
      )

    if (updateError) {
      console.error('Profile image metadata update failed', updateError)
      await supabaseAdmin.storage.from(PROFILE_MEDIA_BUCKET).remove([storagePath]).catch(() => undefined)
      return NextResponse.json({ message: 'Image upload failed.' }, { status: 500 })
    }

    return NextResponse.json({ kind, url: publicUrl, storagePath })
  } catch (error) {
    console.error('Profile image upload failed', error)
    return NextResponse.json({ message: 'Image upload failed.' }, { status: 500 })
  }
}
