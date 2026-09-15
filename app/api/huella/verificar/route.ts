export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { diasParaVencer, formatDate } from '@/lib/utils';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos — igual que el resto de métodos

// ─── GET /api/huella/verificar ─────────────────────────────────────────────────
// Devuelve la lista de credentialId registrados en la BD para que el cliente
// pueda armar el array `allowCredentials` de la llamada WebAuthn. 
// Sin este listado el navegador no sabe qué credencial pedir al huellero.
// ──────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, nombre, huella_id
      FROM usuarios
      WHERE activo = true AND huella_id IS NOT NULL
    `;
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── POST /api/huella/verificar ────────────────────────────────────────────────
// Recibe el resultado de navigator.credentials.get() y, si el credentialId
// coincide con un socio, registra su asistencia.
//
// El browser ya verificó internamente la firma con la clave privada del
// dispositivo — nosotros solo necesitamos hacer match del credentialId contra
// la BD (el WA28 firmó con su hardware, el navegador confirmó la firma).
//
// Body: { credentialId: string }
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { credentialId } = await req.json();

    if (!credentialId) {
      return NextResponse.json({ error: 'Falta credentialId' }, { status: 400 });
    }

    // Buscar el socio que tiene esa credencial registrada
    const usuarios = await sql`
      SELECT * FROM usuarios
      WHERE huella_id = ${credentialId} AND activo = true
    `;

    if (!usuarios.length) {
      return NextResponse.json({ error: 'Huella no registrada' }, { status: 404 });
    }

    const usuario = usuarios[0];
    const planVigente = diasParaVencer(usuario.plan_vencimiento) >= 0;

    // Chequeo de duplicado reciente (mismo criterio que /api/asistencia)
    const ultimas = await sql`
      SELECT timestamp FROM asistencias
      WHERE usuario_id = ${usuario.id}
      ORDER BY timestamp DESC
      LIMIT 1
    `;

    if (ultimas.length) {
      const msDesdeUltima = Date.now() - new Date(ultimas[0].timestamp).getTime();
      if (msDesdeUltima < COOLDOWN_MS) {
        return NextResponse.json({
          duplicado: true,
          usuario,
          planVigente,
          mensaje: `${usuario.nombre} ya registró su ingreso hace instantes`,
        });
      }
    }

    // Registrar asistencia
    const rows = await sql`
      INSERT INTO asistencias (usuario_id, metodo, exitoso)
      VALUES (${usuario.id}, 'huella', ${planVigente})
      RETURNING *
    `;

    return NextResponse.json({
      asistencia: rows[0],
      usuario,
      planVigente,
      mensaje: planVigente
        ? `¡Bienvenido/a, ${usuario.nombre}!`
        : `Plan vencido el ${formatDate(usuario.plan_vencimiento)}`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
