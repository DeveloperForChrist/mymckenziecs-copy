import Link from 'next/link';
type HeroActionButtonsProps = {
  hasAccountSession: boolean;
  hasPaidAccess: boolean;
};

export default function HeroActionButtons({ hasAccountSession, hasPaidAccess }: HeroActionButtonsProps) {
  const dashboardHref = hasPaidAccess ? '/dashboard' : '/pricing?redirect=%2Fsettings%3Ftab%3Dbilling';
  const dashboardLabel = hasPaidAccess ? 'Go to Dashboard' : hasAccountSession ? 'Complete setup' : 'Log in';

  return (
    <div className="mt-7 flex flex-wrap gap-3 justify-center xl:justify-start">
      <Link
        href="/pricing"
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        Choose plan
      </Link>
      <Link
        href={hasAccountSession ? dashboardHref : '/auth/signin'}
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        {dashboardLabel}
      </Link>
    </div>
  );
}
