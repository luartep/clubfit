export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_VALUE } from '@/proxy';

const ADMIN_USER = process.env.ADMIN_USER || 'pala';
const ADMIN_PASS = process.env.ADMIN_PASS || 'pala123';

export async function POST(req: NextRequest) {
  try {
    const { usuario, clave } = await req.json();

    if (usuario === ADMIN_USER && clave === ADMIN_PASS) {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(SESSION_COOKIE, SESSION_VALUE, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 días
      });
      return res;
    }

    return NextResponse.json({ error: 'Usuario o clave incorrectos' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
}
