export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

// Backup completo de la base de datos (usuarios + asistencias) en un solo JSON.
// Pensado para guardarlo aparte (tu computador, Google Drive, etc.) y poder
// restaurarlo desde el panel si algo sale mal.
export async function GET() {
  try {
    const usuarios = await sql`SELECT * FROM usuarios ORDER BY id ASC`;
    const asistencias = await sql`SELECT * FROM asistencias ORDER BY id ASC`;

    const backup = {
      version: 1,
      generadoEl: new Date().toISOString(),
      usuarios,
      asistencias,
    };

    const fecha = new Date().toISOString().split('T')[0];
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="backup-clubfit-${fecha}.json"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
