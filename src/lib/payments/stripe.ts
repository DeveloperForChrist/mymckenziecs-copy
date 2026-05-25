import Stripe from 'stripe'

let cachedStripe: Stripe | null = null

const getStripe = () => {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not defined')
  }

  cachedStripe ??= new Stripe(secretKey, {
    apiVersion: '2025-10-29.clover',
    typescript: true,
  })

  return cachedStripe
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver)
  },
})
