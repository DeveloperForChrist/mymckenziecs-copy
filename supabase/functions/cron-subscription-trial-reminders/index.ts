import { serve } from 'https://deno.land/std@0.201.0/http/server.ts'

serve(() => {
  return new Response(
    JSON.stringify({
      ok: true,
      disabled: true,
      message: 'Subscription trial reminders are disabled because trials are no longer offered.',
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  )
})
