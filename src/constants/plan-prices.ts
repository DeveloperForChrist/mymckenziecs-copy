// Stripe price IDs for plans (replace with your actual price IDs if different)
export const PLAN_PRICES = [
  {
    name: 'Standard',
    priceId: process.env.NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID || 'price_1SzUXCF1Ztd0SoyJWvgmgPMV',
    display: '£15/Month',
    features: [
      'Everything included in Basic',
      'Unlimited conversations with a 30‑message per thread limit',
      '15 document storage',
      'Persistent chat history',
      'Deadline reminder emails',
    ],
  },
  {
    name: 'Essential',
    priceId: process.env.NEXT_PUBLIC_STRIPE_ESSENTIAL_PRICE_ID || 'price_1T1mFrF1Ztd0SoyJaYi5E23c',
    display: '£25/Month',
    features: [
      'Everything included in Basic',
      'Unlimited conversations with a 40‑message per thread limit',
      '20 document storage',
      'Persistent chat history',
      'Case law search + MyMckenzie Case Study',
      'Deadline reminder emails',
    ],
  },
  {
    name: 'Premium Cheap',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_CHEAP_PRICE_ID || '',
    display: '£1/Month',
    features: [
      'Everything included in Essential',
      'Unlimited conversations with a 50‑message per thread limit',
      '30 document storage',
      'Persistent chat history',
      'Case law search + MyMckenzie Case Study',
      'Deadline reminder emails',
      'Priority support (reply within 24 hours)',
      'Early access to new features',
    ],
  },
  {
    name: 'Plus',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PLUS_PRICE_ID || 'price_1T1mG7F1Ztd0SoyJqX7KU9vm',
    display: '£45/Month',
    features: [
      'Everything included in Essential',
      'Unlimited conversations with a 50‑message per thread limit',
      '30 document storage',
      'Persistent chat history',
      'Case law search + MyMckenzie Case Study',
      'Deadline reminder emails',
      'Priority support (reply within 24 hours)',
      'Early access to new features',
    ],
  },
];
