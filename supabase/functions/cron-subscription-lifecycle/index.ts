import { serve } from 'https://deno.land/std@0.201.0/http/server.ts'

serve(async () => {
  try {
    const appUrl = (Deno.env.get('NEXT_PUBLIC_APP_URL') || Deno.env.get('APP_URL') || '').trim()
    const cronSecret = (Deno.env.get('CRON_SECRET') || '').trim()

    if (!appUrl) {
      return new Response(JSON.stringify({ error: 'APP_URL is not configured' }), { status: 500 })
    }
    if (!cronSecret) {
      return new Response(JSON.stringify({ error: 'CRON_SECRET is not configured' }), { status: 500 })
    }

    const target = `${appUrl.replace(/\/+$/, '')}/api/cron/subscription-lifecycle`
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        'x-cron-secret': cronSecret,
      },
    })

    const text = await response.text()
    return new Response(text, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json',
      },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), { status: 500 })
  }
})
