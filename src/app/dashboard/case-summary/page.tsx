import { redirect } from 'next/navigation';

export default function CaseSummaryRedirectPage() {
  redirect('/dashboard/documents');
}
