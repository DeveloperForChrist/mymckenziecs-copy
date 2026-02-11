#!/usr/bin/env node

/**
 * Sync pass products and prices to Stripe
 * Run: node scripts/sync-stripe-passes.mjs
 */

import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load pass definitions
const passDefinitionsPath = path.join(__dirname, '../src/data/pass-definitions.json');
const passDefinitions = JSON.parse(fs.readFileSync(passDefinitionsPath, 'utf-8'));

const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2025-10-29.clover',
  typescript: true,
});

async function syncPasses() {
  console.log('🔄 Syncing passes to Stripe...\n');

  for (const pass of passDefinitions) {
    const { slug, label, days, price } = pass;

    console.log(`📦 Processing: ${label} (${slug})`);

    try {
      // Search for existing product by slug metadata
      const productQuery = `metadata['pass_slug']:'${slug}'`;
      const productSearch = await stripe.products.search({ query: productQuery, limit: 1 });
      
      let product = productSearch.data[0];

      if (product) {
        console.log(`  ✓ Product exists: ${product.id}`);
        
        // Update product name if changed
        if (product.name !== label) {
          await stripe.products.update(product.id, { name: label });
          console.log(`  ✓ Updated product name to: ${label}`);
        }
      } else {
        // Create new product
        product = await stripe.products.create({
          name: label,
          description: `${days}-day pass for MyMcKenzie`,
          metadata: {
            pass_slug: slug,
            days: days.toString(),
          },
        });
        console.log(`  ✓ Created product: ${product.id}`);
      }

      // Create new price (prices are immutable, so we create new ones)
      const priceInPence = Math.round(price * 100);
      
      const newPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: priceInPence,
        currency: 'gbp',
        metadata: {
          pass_slug: slug,
        },
      });

      // Set as default price
      await stripe.products.update(product.id, {
        default_price: newPrice.id,
      });

      console.log(`  ✓ Created price: ${newPrice.id} (£${price})`);
      console.log(`  ✓ Set as default price\n`);

    } catch (error) {
      console.error(`  ❌ Error processing ${slug}:`, error.message);
    }
  }

  console.log('✅ Sync complete!');
}

syncPasses().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
