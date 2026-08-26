export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { calcularVencimiento, validarRut } from '@/lib/utils';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      rut VARCHAR(12) NOT NULL UNIQUE,
      email VARCHAR(200),
      telefono VARCHAR(20),
      foto TEXT,
      foto_descriptor TEXT,
      plan_tipo VARCHAR(50) NOT NULL,
      plan_inicio DATE NOT NULL,
      plan_vencimiento DATE NOT NULL,
      activo BOOLEAN DEFAULT true,
      huella_id TEXT,
      huella_credencial TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS asistencias (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      metodo VARCHAR(20) NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW(),
      exitoso BOOLEAN DEFAULT true
    )
  `;
}

export async function GET(req: NextRequest) {
  try {
    await ensureTables();
    const { searchParams } = new URL(req.url);
    const buscar = searchParams.get('buscar') || '';
    const rut = searchParams.get('rut');

    if (rut) {
      const rows = await sql`SELECT * FROM usuarios WHERE rut = ${rut} LIMIT 1`;
      return NextResponse.json(rows[0] || null);
    }

    if (buscar) {
      const rows = await sql`
        SELECT * FROM usuarios 
        WHERE nombre ILIKE ${'%' + buscar + '%'} OR rut ILIKE ${'%' + buscar + '%'}
        ORDER BY nombre ASC
      `;
      return NextResponse.json(rows);
    }

    const rows = await sql`SELECT * FROM usuarios ORDER BY nombre ASC`;
    return NextResponse.json(rows);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const body = await req.json();
    const { nombre, rut, email, telefono, foto, fotoDescriptor, planTipo } = body;

    if (!nombre || !rut || !planTipo) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const inicio = new Date();
    const vencimiento = calcularVencimiento(inicio, planTipo);

    const rows = await sql`
      INSERT INTO usuarios (nombre, rut, email, telefono, foto, foto_descriptor, plan_tipo, plan_inicio, plan_vencimiento)
      VALUES (${nombre}, ${rut}, ${email || null}, ${telefono || null}, ${foto || null}, ${fotoDescriptor || null}, ${planTipo}, ${inicio.toISOString().split('T')[0]}, ${vencimiento.toISOString().split('T')[0]})
      RETURNING *
    `;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (e: any) {
    if (e.message?.includes('unique')) {
      return NextResponse.json({ error: 'El RUT ya está registrado' }, { status: 409 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
