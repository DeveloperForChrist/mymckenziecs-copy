// Stripe price IDs for plans (replace with your actual price IDs if different)
export const PLAN_PRICES = [
  {
    name: 'Basic',
    priceId:
      process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID ||
      process.env.NEXT_PUBLIC_STRIPE_ESSENTIAL_PRICE_ID ||
      '',
    display: '£18/Month',
    features: [
      'MyMcKenzieCS Basic Assistant',
      '10 document storage',
      'Conversation history included',
    ],
  },
  {
    name: 'Premium',
    priceId:
      process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ||
      '',
    display: '£32/Month',
    features: [
      'MyMcKenzieCS Smart Assistant',
      '25 document storage',
      'Conversation history included',
      'Enhanced research support',
      'Deadline reminder emails',
    ],
  },
  {
    name: 'Premium +',
    priceId:
      process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PLUS_PRICE_ID ||
      process.env.NEXT_PUBLIC_STRIPE_PLUS_PRICE_ID ||
      '',
    display: '£199/Month',
    features: [
      'MyMcKenzieCS Intelligent Assistant',
      '150+ document storage',
      'Persistent chat history',
      'Advanced case law retrieval and study',
      'Deadline reminder emails',
    ],
  },
];
