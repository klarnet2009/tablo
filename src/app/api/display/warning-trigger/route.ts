'use server';

import { NextResponse } from 'next/server';

// Simple in-memory trigger flag (resets on server restart)
let warningTrigger = false;

export async function GET() {
    return NextResponse.json({ trigger: warningTrigger });
}

export async function POST() {
    warningTrigger = true;
    return NextResponse.json({ success: true, message: 'Warning triggered' });
}

export async function DELETE() {
    warningTrigger = false;
    return NextResponse.json({ success: true, message: 'Warning cleared' });
}
