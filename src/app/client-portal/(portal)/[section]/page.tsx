import { notFound } from 'next/navigation'
import ClientPortalPage from '../page'

const PORTAL_SECTIONS = new Set(['messages', 'meetings', 'documents', 'matter'])

type ClientPortalSectionPageProps = {
  params: Promise<{ section: string }>
}

export default async function ClientPortalSectionPage({ params }: ClientPortalSectionPageProps) {
  const { section } = await params
  if (!PORTAL_SECTIONS.has(section)) notFound()

  return <ClientPortalPage />
}
