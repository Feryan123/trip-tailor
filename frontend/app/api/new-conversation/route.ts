import { NextResponse } from 'next/server';

export async function POST() {
  const conversationId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  return NextResponse.json({ conversationId });
}
