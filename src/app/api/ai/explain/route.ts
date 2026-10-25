import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { callClaude } from '@/lib/ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt ?? '').trim().slice(0, 2000);
    const answer = String(body?.answer ?? '').trim().slice(0, 500);
    const lang: 'km' | 'en' = body?.language === 'en' ? 'en' : 'km';
    if (!prompt || !answer) {
      return NextResponse.json({ error: 'Add the question and its correct answer first.' }, { status: 400 });
    }

    const system = `You are a patient mathematics teacher. Explain how to solve the given problem step by step so a student can follow it.
${lang === 'km' ? 'Write in Khmer (ភាសាខ្មែរ).' : 'Write in English.'}
Put every mathematical expression in LaTeX between single dollar signs, e.g. $2x+3=11$.
Use short numbered steps and finish with the final answer. Output only the explanation text.
The teacher's answer key says the correct answer is given below. Solve the problem yourself; if you get a DIFFERENT result, begin your reply with the exact line "WARNING: my result differs from the answer key." and then explain your own working.`;

    const user = `Problem: ${prompt}\nAnswer key: ${answer}`;
    const explanation = await callClaude(system, user, 1500);
    return NextResponse.json({ explanation });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
