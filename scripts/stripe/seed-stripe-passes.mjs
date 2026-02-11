#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Stripe from 'stripe';

const ROOT = process.cwd();
const dataPath = path.join(ROOT, 'src', 'data', 'pass-definitions.json');

if (!fs.existsSync(dataPath)) {
  console.error('Unable to locate pass definitions at', dataPath);
  process.exit(1);
}

const passDefinitions = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const stripeSecret = process.env.STRIPE_SECRET_KEY;
if (!stripeSecret) {
  console.error('STRIPE_SECRET_KEY must be set to run this script.');
  process.exit(1);
}

const currency = (process.env.STRIPE_PASS_CURRENCY || 'gbp').toLowerCase();
const stripe = new Stripe(stripeSecret, {
  apiVersion: '2024-11-20.acacia'
});

const sleep = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

async function findProductBySlug(slug) {
  const query = `metadata['pass_slug']:'${slug}'`;
  try {
    const searchResult = await stripe.products.search({ query, limit: 1 });
    return searchResult.data[0] || null;
  } catch (error) {
    console.warn(`Stripe product search unavailable, falling back to list for slug (${slug}).`, error.message);
    const list = await stripe.products.list({ limit: 100, active: true });
    return list.data.find(product => product.metadata?.pass_slug === slug) || null;
  }
}

async function ensurePassProduct(definition) {
  const { slug, label, micro, days, price, features } = definition;
  const amount = Math.round(price * 100);
  let product = await findProductBySlug(slug);

  if (!product) {
    product = await stripe.products.create({
      name: label,
      description: micro,
      active: true,
      statement_descriptor: 'MyMcKenzie Pass',
      metadata: {
        pass_slug: slug,
        pass_days: String(days),
        pass_features: features.slice(0, 10).join(' | ')
      }
    });
    console.log(`✅ Created product ${label} (${product.id})`);
  } else {
    await stripe.products.update(product.id, {
      name: label,
      description: micro,
      active: true,
      metadata: {
        pass_slug: slug,
        pass_days: String(days),
        pass_features: features.slice(0, 10).join(' | ')
      }
    });
    console.log(`ℹ️  Updated product ${label} (${product.id})`);
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100
  });

  let priceRecord = prices.data.find(
    (item) =>
      !item.recurring &&
      item.currency === currency &&
      item.unit_amount === amount
  );

  if (!priceRecord) {
    priceRecord = await stripe.prices.create({
      currency,
      unit_amount: amount,
      product: product.id,
      nickname: `${label} Pass`,
      metadata: {
        pass_slug: slug,
        pass_days: String(days)
      }
    });
    console.log(`  ➕ Created price ${priceRecord.id} (${currency.toUpperCase()} ${amount / 100})`);
  } else {
    console.log(`  ✅ Found price ${priceRecord.id} (${currency.toUpperCase()} ${amount / 100})`);
  }

  if (product.default_price !== priceRecord.id) {
    await stripe.products.update(product.id, { default_price: priceRecord.id });
    console.log(`  🔗 Linked ${priceRecord.id} as default price for ${product.id}`);
  }

  await sleep(250);
  return { productId: product.id, priceId: priceRecord.id };
}

async function main() {
  console.log('🔄 Syncing Stripe products for MyMcKenzie passes…');
  const results = [];

  for (const definition of passDefinitions) {
    const slug = definition.slug;
    if (!slug) {
      console.warn('Skipping pass definition without slug:', definition);
      continue;
    }

    const result = await ensurePassProduct(definition);
    results.push({
      slug,
      label: definition.label,
      ...result
    });
  }

  console.log('\n🎉 Pass sync complete:');
  results.forEach(entry => {
    console.log(
      ` • ${entry.label} -> product ${entry.productId}, price ${entry.priceId}`
    );
  });
}

main().catch((error) => {
  console.error('Stripe pass sync failed:', error);
  process.exit(1);
});
