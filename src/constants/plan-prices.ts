// Stripe price IDs for plans (replace with your actual price IDs if different)
export const PLAN_PRICES = [
  {
    name: 'Standard',
    priceId: 'price_1SzUXCF1Ztd0SoyJWvgmgPMV',
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
    priceId: 'price_1SdKVHK39SdPnLNUgTE3dhSg',
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
    name: 'Plus',
    priceId: 'price_1SdKVIK39SdPnLNURgr8DlL2',
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
