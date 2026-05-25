import { redirect } from 'next/navigation'

export default async function JoinMeetingPage({ params }: { params: Promise<{ room: string }> }) {
  const { room = '' } = await params
  redirect(`/video-call?room=${encodeURIComponent(room)}`)
}
