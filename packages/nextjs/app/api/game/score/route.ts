import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.gummybera.com';

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { walletAddress, score } = data;

    if (!walletAddress || score === undefined) {
      return NextResponse.json({ error: 'Wallet address and score are required' }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/runnerapi/game/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY as string,
      },
      body: JSON.stringify({ walletAddress, score }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: result.error || 'Failed to submit score' },
        { status: response.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error submitting score:', error);
    return NextResponse.json({ error: 'Failed to submit score' }, { status: 500 });
  }
}