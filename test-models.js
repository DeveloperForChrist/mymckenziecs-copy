const Anthropic = require('@anthropic-ai/sdk').default;

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('ANTHROPIC_API_KEY not set');
  process.exit(1);
}

const client = new Anthropic({ apiKey });

const models = [
  'claude-3-opus-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-opus-4-1-20250805',
];

async function testModel(modelName) {
  try {
    const response = await client.messages.create({
      model: modelName,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'test' }],
    });
    console.log(`✅ ${modelName} - WORKS`);
    return true;
  } catch (error) {
    console.log(`❌ ${modelName} - ${error.error?.error?.message || error.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing available models...\n');
  for (const model of models) {
    await testModel(model);
  }
}

main();
