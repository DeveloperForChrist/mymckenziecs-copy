import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import DirectoryClient from '@/components/directory/DirectoryClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Find Legal Professionals',
  description: 'Browse our directory of McKenzie Friends, paralegals, and legal consultants to find the right professional for your case.',
  path: '/directory',
});

export default function PublicDirectoryPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      <div className="container mx-auto px-4 py-12">
        <Link 
          href="/" 
          className="inline-flex items-center text-white/80 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="mr-2" size={20} />
          Back to Home
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            Find Legal Professionals
          </h1>
          <p className="text-lg text-white/80">
            Browse our directory of McKenzie Friends, paralegals, and legal consultants to find the right professional for your case.
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/20 shadow-2xl">
          <DirectoryClient mode="litigant" />
        </div>
      </div>
    </div>
  );
}
