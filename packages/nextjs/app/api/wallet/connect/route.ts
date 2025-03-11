import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_KEY;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.gummybera.com';

export async function POST(req: NextRequest) {
  const requestId = `wallet-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  console.log(`[Wallet API ${requestId}] Received connection request`);

  try {
    const data = await req.json();
    const { walletAddress } = data;

    if (!walletAddress) {
      console.warn(`[Wallet API ${requestId}] Missing wallet address`);
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Basic Ethereum address validation
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(walletAddress)) {
      console.warn(`[Wallet API ${requestId}] Invalid wallet address format`);
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/runnerapi/wallet/connect-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY as string,
        'Origin': req.headers.get('origin') || '',
        'X-Real-IP': req.headers.get('x-real-ip') || '',
        'x-request-id': requestId
      },
      body: JSON.stringify({ walletAddress }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`[Wallet API ${requestId}] Backend error:`, result);
      return NextResponse.json(
        { error: result.error || 'Failed to connect wallet' },
        { status: response.status }
      );
    }

    console.log(`[Wallet API ${requestId}] Success:`, result);
    return NextResponse.json(result);

  } catch (error) {
    console.error(`[Wallet API ${requestId}] Error:`, error);
    return NextResponse.json({ error: 'Failed to process wallet connection' }, { status: 500 });
  }
}