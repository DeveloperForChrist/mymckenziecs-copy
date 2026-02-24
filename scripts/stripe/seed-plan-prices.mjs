#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Stripe from 'stripe';

const ROOT = process.cwd();
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('STRIPE_SECRET_KEY must be set to run this script.');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });

const PLANS = [
  { slug: 'basic', label: 'Basic', amount: 1800, interval: 'month', currency: 'gbp' },
  { slug: 'premium', label: 'Premium', amount: 3200, interval: 'month', currency: 'gbp' },
  { slug: 'premium-plus', label: 'Premium +', amount: 19900, interval: 'month', currency: 'gbp' },
];

async function findProductBySlug(slug) {
  const query = `metadata['plan_slug']:'${slug}'`;
  try {
    const res = await stripe.products.search({ query, limit: 1 });
    return res.data[0] || null;
  } catch (err) {
    const list = await stripe.products.list({ limit: 100, active: true });
    return list.data.find(p => p.metadata?.plan_slug === slug) || null;
  }
}

async function ensurePlan(plan) {
  const { slug, label, amount, interval, currency } = plan;
  let product = await findProductBySlug(slug);

  if (!product) {
    product = await stripe.products.create({
      name: `${label} Plan`,
      description: `${label} subscription plan for MyMcKenzie`,
      active: true,
      metadata: { plan_slug: slug }
    });
    console.log(`Created product ${product.id} (${label})`);
  } else {
    await stripe.products.update(product.id, {
      name: `${label} Plan`,
      description: `${label} subscription plan for MyMcKenzie`,
      active: true,
      metadata: { plan_slug: slug }
    });
    console.log(`Updated product ${product.id} (${label})`);
  }

  const prices = await stripe.prices.list({ product: product.id, limit: 100 });
  let price = prices.data.find(p => p.recurring && p.recurring.interval === interval && p.unit_amount === amount && p.currency === currency);

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: amount,
      currency,
      recurring: { interval },
      nickname: `${label} ${interval}`,
      metadata: { plan_slug: slug }
    });
    console.log(`  Created price ${price.id} (${currency} ${amount/100}/${interval})`);
  } else {
    console.log(`  Found price ${price.id} (${currency} ${amount/100}/${interval})`);
  }

  if (product.default_price !== price.id) {
    await stripe.products.update(product.id, { default_price: price.id });
    console.log(`  Linked ${price.id} as default for ${product.id}`);
  }

  return { slug, productId: product.id, priceId: price.id };
}

async function main() {
  console.log('Syncing plans to Stripe...');
  const results = [];
  for (const p of PLANS) {
    try {
      const r = await ensurePlan(p);
      results.push(r);
    } catch (err) {
      console.error('Failed for plan', p.slug, err?.message || err);
    }
  }

  const outPath = path.join(ROOT, 'scripts', 'stripe', 'plan-price-ids.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log('\nWrote mapping to', outPath);
  results.forEach(r => console.log(` • ${r.slug}: product=${r.productId}, price=${r.priceId}`));
}

main().catch(err => { console.error(err); process.exit(1); });
