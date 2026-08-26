export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

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
