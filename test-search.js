const fetch = require('node-fetch');

async function testSearch() {
  try {
    const response = await fetch('http://localhost:3000/api/search-case-law', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'landlord',
        filters: {},
        limit: 15,
      }),
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSearch();
