export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

// Evita marcar dos veces a la misma persona en un lapso muy corto
// (ej. reconocimiento facial reintentando cada 3 segundos).
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { usuarioId, metodo } = body;

    if (!usuarioId || !metodo) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 });
    }

    // Verificar que el usuario tiene plan vigente
    const usuarios = await sql`
      SELECT * FROM usuarios WHERE id = ${usuarioId} AND activo = true
    `;
    
    if (!usuarios.length) {
      return NextResponse.json({ error: 'Usuario no encontrado o inactivo' }, { status: 404 });
    }

    const usuario = usuarios[0];
    const hoy = new Date();
    const vencimiento = new Date(usuario.plan_vencimiento);
    const planVigente = vencimiento >= hoy;

    // Chequeo de duplicado reciente
    const ultimas = await sql`
      SELECT timestamp FROM asistencias
      WHERE usuario_id = ${usuarioId}
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

    const rows = await sql`
      INSERT INTO asistencias (usuario_id, metodo, exitoso)
      VALUES (${usuarioId}, ${metodo}, ${planVigente})
      RETURNING *
    `;

    return NextResponse.json({
      asistencia: rows[0],
      usuario: usuario,
      planVigente,
      mensaje: planVigente 
        ? `¡Bienvenido/a, ${usuario.nombre}!` 
        : `Plan vencido el ${new Date(usuario.plan_vencimiento).toLocaleDateString('es-CL')}`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const usuarioId = searchParams.get('usuarioId');
    const soloHoy = searchParams.get('hoy') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    if (usuarioId) {
      const rows = await sql`
        SELECT a.*, u.nombre, u.rut FROM asistencias a
        JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.usuario_id = ${parseInt(usuarioId)}
        ORDER BY a.timestamp DESC LIMIT ${limit}
      `;
      return NextResponse.json(rows);
    }

    // Todas las asistencias de hoy, sin límite — para que el contador
    // "Asistencias Hoy" del panel no se quede pegado en el tope de LIMIT.
    if (soloHoy) {
      const rows = await sql`
        SELECT a.*, u.nombre, u.rut FROM asistencias a
        JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.timestamp >= CURRENT_DATE AND a.timestamp < CURRENT_DATE + INTERVAL '1 day'
        ORDER BY a.timestamp DESC
      `;
      return NextResponse.json(rows);
    }

    const rows = await sql`
      SELECT a.*, u.nombre, u.rut FROM asistencias a
      JOIN usuarios u ON a.usuario_id = u.id
      ORDER BY a.timestamp DESC LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Reinicia el conteo de asistencias. Protegido: solo el panel admin puede llamarlo (ver proxy.ts).
// ?todo=true borra todo el historial; sin ese parámetro, borra solo las asistencias de hoy.
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const todo = searchParams.get('todo') === 'true';

    const rows = todo
      ? await sql`DELETE FROM asistencias RETURNING id`
      : await sql`
          DELETE FROM asistencias
          WHERE timestamp >= CURRENT_DATE AND timestamp < CURRENT_DATE + INTERVAL '1 day'
          RETURNING id
        `;

    return NextResponse.json({ ok: true, eliminadas: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
