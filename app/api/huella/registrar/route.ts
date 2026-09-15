export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

// ─── POST /api/huella/registrar ────────────────────────────────────────────────
// Guarda la credencial WebAuthn que el navegador genera al registrar una huella.
// El body debe tener:
//   { usuarioId: number, credentialId: string, credencial: string }
// donde `credencial` es el JSON completo del PublicKeyCredential serializado.
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { usuarioId, credentialId, credencial } = await req.json();

    if (!usuarioId || !credentialId || !credencial) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    // Verificar que el usuario existe
    const rows = await sql`SELECT id, nombre FROM usuarios WHERE id = ${usuarioId} AND activo = true`;
    if (!rows.length) {
      return NextResponse.json({ error: 'Usuario no encontrado o inactivo' }, { status: 404 });
    }

    // Guardar credencial en los campos ya existentes en el schema:
    //   huella_id  → credentialId (identificador único de la credencial)
    //   huella_credencial → JSON completo (clave pública + contador)
    await sql`
      UPDATE usuarios
      SET
        huella_id         = ${credentialId},
        huella_credencial = ${credencial},
        updated_at        = NOW()
      WHERE id = ${usuarioId}
    `;

    return NextResponse.json({ ok: true, nombre: rows[0].nombre });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ─── DELETE /api/huella/registrar?usuarioId=N ──────────────────────────────────
// Elimina la huella registrada de un socio (desde el panel admin).
// ──────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const usuarioId = searchParams.get('usuarioId');

    if (!usuarioId) {
      return NextResponse.json({ error: 'Falta usuarioId' }, { status: 400 });
    }

    await sql`
      UPDATE usuarios
      SET huella_id = NULL, huella_credencial = NULL, updated_at = NOW()
      WHERE id = ${parseInt(usuarioId)}
    `;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
