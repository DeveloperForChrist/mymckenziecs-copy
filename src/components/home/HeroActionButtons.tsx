import Link from 'next/link';

type HeroActionButtonsProps = {
  pricingHref?: string;
  howItWorksHref?: string;
};

export default function HeroActionButtons({
  pricingHref = '/pricing',
  howItWorksHref = '/legal-case-management-tool',
}: HeroActionButtonsProps) {
  return (
    <div className="mt-7 flex flex-wrap gap-3 justify-center xl:justify-start">
      <Link
        href={pricingHref}
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        Try for free
      </Link>
      <Link
        href={howItWorksHref}
        className="app-button-secondary text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
      >
        How it works
      </Link>
    </div>
  );
}
