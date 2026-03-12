// Stripe price IDs for plans (replace with your actual price IDs if different)
export const DEADLINE_REMINDER_FEATURE = 'Scheduled series of deadline reminder emails (21, 14, 7, 5, 3, and 1 day before)'

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
      'Limited daily web research with source citations',
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
      'Expanded web research with source citations',
      DEADLINE_REMINDER_FEATURE,
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
      '150 document storage',
      'Persistent chat history',
      'Enhanced research support with source citations',
      'Advanced case law retrieval and study',
      DEADLINE_REMINDER_FEATURE,
    ],
  },
];
