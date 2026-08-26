export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { calcularVencimiento } from '@/lib/utils';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`SELECT * FROM usuarios WHERE id = ${parseInt(id)}`;
  return NextResponse.json(rows[0] || null);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { nombre, email, telefono, foto, fotoDescriptor, planTipo, activo, huellaId, huellaCredencial } = body;

  const vencimiento = planTipo ? calcularVencimiento(new Date(), planTipo) : undefined;

  const rows = await sql`
    UPDATE usuarios SET
      nombre = COALESCE(${nombre || null}, nombre),
      email = COALESCE(${email || null}, email),
      telefono = COALESCE(${telefono || null}, telefono),
      foto = COALESCE(${foto || null}, foto),
      foto_descriptor = COALESCE(${fotoDescriptor || null}, foto_descriptor),
      plan_tipo = COALESCE(${planTipo || null}, plan_tipo),
      plan_vencimiento = COALESCE(${vencimiento ? vencimiento.toISOString().split('T')[0] : null}, plan_vencimiento),
      activo = COALESCE(${activo !== undefined ? activo : null}, activo),
      huella_id = COALESCE(${huellaId || null}, huella_id),
      huella_credencial = COALESCE(${huellaCredencial || null}, huella_credencial),
      updated_at = NOW()
    WHERE id = ${parseInt(id)}
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM usuarios WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
