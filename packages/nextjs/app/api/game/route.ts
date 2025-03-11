import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.gummybera.com';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get('limit') || '10';
    
    const response = await fetch(`${API_URL}/runnerapi/game/leaderboard?limit=${limit}`, {
      headers: {
        'x-api-key': API_KEY as string,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || 'Failed to fetch leaderboard' },
        { status: response.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}