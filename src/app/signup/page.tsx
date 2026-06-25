import { redirect } from 'next/navigation'

type LegacySignupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function LegacySignupPage({ searchParams }: LegacySignupPageProps) {
  const params = searchParams ? await searchParams : {}
  const nextParams = new URLSearchParams()

  for (const [key, rawValue] of Object.entries(params)) {
    const value = firstParam(rawValue)
    if (typeof value === 'string' && value.trim()) {
      nextParams.set(key, value)
    }
  }

  if (nextParams.has('token') && !nextParams.has('redirect')) {
    nextParams.set('redirect', '/client-portal')
  }

  const href = nextParams.size > 0 ? `/auth/signup?${nextParams.toString()}` : '/auth/signup'
  redirect(href)
}
