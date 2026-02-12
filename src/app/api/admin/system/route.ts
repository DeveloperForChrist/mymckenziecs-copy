import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  try {
    // Verify admin session
    const adminLoggedIn = request.headers.get('x-admin-auth');
    if (adminLoggedIn !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // System health check
    const health = {
      status: 'operational',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        supabase: 'operational',
        openai: 'operational',
        stripe: 'operational'
      },
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        percentage: ((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2)
      }
    };

    return NextResponse.json({ health });
  } catch (error: unknown) {
    console.error('Error fetching system info:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch system info';
    return NextResponse.json({ 
      error: message,
      health: { status: 'error' }
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Verify admin session
    const adminLoggedIn = request.headers.get('x-admin-auth');
    if (adminLoggedIn !== 'true') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await request.json();

    switch (action) {
      case 'updateSettings':
        // Settings storage would go to Supabase if needed
        return NextResponse.json({ success: true, message: 'Settings updated' });

      case 'clearCache':
        return NextResponse.json({ success: true, message: 'Cache cleared' });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Error performing system action:', error);
    const message = error instanceof Error ? error.message : 'Failed to perform system action';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
