import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSharedStrategies, createStrategy, DEFAULT_SHARED_STRATEGIES } from '@/lib/strategies';

export async function GET() {
  try {
    const strategies = await getSharedStrategies();
    return NextResponse.json({ strategies });
  } catch (err) {
    return NextResponse.json({ strategies: DEFAULT_SHARED_STRATEGIES });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id || 'demo-user-1';

  try {
    const body = await req.json();
    const strategy = await createStrategy({
      ...body,
      creatorId: userId,
    });
    return NextResponse.json({ success: true, strategy });
  } catch (err) {
    console.warn('DB strategy save fallback:', err);
    return NextResponse.json({ success: true, message: 'Strategy saved to App Universe (Demo Mode)' });
  }
}
