export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { SESSION_COOKIE, SESSION_VALUE } from '@/proxy';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

const ADMIN_USER = process.env.ADMIN_USER || 'pala';
const ADMIN_PASS = process.env.ADMIN_PASS || 'pala123';

const MAX_INTENTOS = 5;
const BLOQUEO_MINUTOS = 15;

async function ensureTabla() {
  await sql`
    CREATE TABLE IF NOT EXISTS login_intentos (
      ip VARCHAR(64) PRIMARY KEY,
      intentos INTEGER NOT NULL DEFAULT 0,
      bloqueado_hasta TIMESTAMP,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

function obtenerIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'desconocida';
}

export async function POST(req: NextRequest) {
  try {
    await ensureTabla();
    const ip = obtenerIp(req);
    const { usuario, clave } = await req.json();

    // ¿Está bloqueada esta IP por demasiados intentos fallidos?
    const registros = await sql`SELECT * FROM login_intentos WHERE ip = ${ip}`;
    const registro = registros[0];
    if (registro?.bloqueado_hasta && new Date(registro.bloqueado_hasta) > new Date()) {
      const minutosRestantes = Math.ceil((new Date(registro.bloqueado_hasta).getTime() - Date.now()) / 60000);
      return NextResponse.json({
        error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutosRestantes} minuto${minutosRestantes === 1 ? '' : 's'}.`,
      }, { status: 429 });
    }

    if (usuario === ADMIN_USER && clave === ADMIN_PASS) {
      // Login correcto: limpiar el contador de intentos de esta IP
      await sql`DELETE FROM login_intentos WHERE ip = ${ip}`;

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

    // Login incorrecto: sumar el intento y bloquear si se pasa del máximo.
    // Si el bloqueo anterior ya venció, se parte de cero en vez de arrastrar
    // el contador viejo — si no, un solo error justo después de esperar los
    // 15 minutos volvía a bloquear al instante otros 15 minutos más.
    const bloqueoYaExpiro = registro?.bloqueado_hasta && new Date(registro.bloqueado_hasta) <= new Date();
    const intentosPrevios = bloqueoYaExpiro ? 0 : (registro?.intentos || 0);
    const intentosNuevos = intentosPrevios + 1;
    const bloquear = intentosNuevos >= MAX_INTENTOS;
    const bloqueadoHasta = bloquear ? new Date(Date.now() + BLOQUEO_MINUTOS * 60000).toISOString() : null;
    await sql`
      INSERT INTO login_intentos (ip, intentos, bloqueado_hasta, updated_at)
      VALUES (${ip}, ${intentosNuevos}, ${bloqueadoHasta}, NOW())
      ON CONFLICT (ip) DO UPDATE SET
        intentos = ${intentosNuevos},
        bloqueado_hasta = ${bloqueadoHasta},
        updated_at = NOW()
    `;

    if (bloquear) {
      return NextResponse.json({
        error: `Demasiados intentos fallidos. Intenta de nuevo en ${BLOQUEO_MINUTOS} minutos.`,
      }, { status: 429 });
    }

    return NextResponse.json({
      error: `Usuario o clave incorrectos (intento ${intentosNuevos} de ${MAX_INTENTOS}).`,
    }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
}
