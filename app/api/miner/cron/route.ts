import { NextResponse } from 'next/server';
import { processPhase2Harvesting, isOffMarketHours } from '@/lib/miner/harvester';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';
    const datasetId = searchParams.get('datasetId') || undefined;

    const result = await processPhase2Harvesting({ force, datasetId });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Failed to run miner cron GET endpoint:', err);
    return NextResponse.json(
      { error: err?.message || 'Harvester cron endpoint failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // Body may be empty on plain POST triggers
    }

    const force = body.force === true;
    const datasetId = body.datasetId || undefined;

    const result = await processPhase2Harvesting({ force, datasetId });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Failed to run miner cron POST endpoint:', err);
    return NextResponse.json(
      { error: err?.message || 'Harvester cron endpoint failed' },
      { status: 500 }
    );
  }
}
