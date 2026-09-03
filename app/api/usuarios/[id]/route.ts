export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM usuarios WHERE id = ${parseInt(id)}`;
  return NextResponse.json(rows[0] || null);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    // Antes se usaba COALESCE(nuevo_valor, valor_actual): si el nuevo valor
    // era falsy (string vacío, null), SIEMPRE se quedaba con el valor viejo.
    // Eso tenía dos efectos no deseados: (1) el RUT nunca se podía editar
    // porque ni siquiera se leía del body, y (2) era imposible borrar una
    // foto/email/teléfono (el botón "Quitar" foto no funcionaba de verdad).
    // Ahora se distingue "el campo no vino en la petición" (no se toca) de
    // "vino explícitamente, aunque sea vacío" (se actualiza a ese valor).
    const tiene = (campo: string) => Object.prototype.hasOwnProperty.call(body, campo);
    const {
      nombre, rut, email, telefono, foto, fotoDescriptor, planTipo,
      planInicio, planVencimiento, activo, huellaId, huellaCredencial,
    } = body;

    const rows = await sql`
      UPDATE usuarios SET
        nombre = CASE WHEN ${tiene('nombre')} THEN ${nombre ?? null} ELSE nombre END,
        rut = CASE WHEN ${tiene('rut')} THEN ${rut ?? null} ELSE rut END,
        email = CASE WHEN ${tiene('email')} THEN ${email || null} ELSE email END,
        telefono = CASE WHEN ${tiene('telefono')} THEN ${telefono || null} ELSE telefono END,
        foto = CASE WHEN ${tiene('foto')} THEN ${foto || null} ELSE foto END,
        foto_descriptor = CASE WHEN ${tiene('fotoDescriptor')} THEN ${fotoDescriptor || null} ELSE foto_descriptor END,
        plan_tipo = CASE WHEN ${tiene('planTipo')} THEN ${planTipo ?? null} ELSE plan_tipo END,
        plan_inicio = CASE WHEN ${tiene('planInicio')} THEN ${planInicio ?? null} ELSE plan_inicio END,
        plan_vencimiento = CASE WHEN ${tiene('planVencimiento')} THEN ${planVencimiento ?? null} ELSE plan_vencimiento END,
        activo = CASE WHEN ${tiene('activo')} THEN ${activo ?? null} ELSE activo END,
        huella_id = CASE WHEN ${tiene('huellaId')} THEN ${huellaId || null} ELSE huella_id END,
        huella_credencial = CASE WHEN ${tiene('huellaCredencial')} THEN ${huellaCredencial || null} ELSE huella_credencial END,
        updated_at = NOW()
      WHERE id = ${parseInt(id)}
      RETURNING *
    `;

    if (!rows[0]) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    if (e.message?.includes('unique')) {
      return NextResponse.json({ error: 'Ese RUT ya está registrado por otro usuario' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM usuarios WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
