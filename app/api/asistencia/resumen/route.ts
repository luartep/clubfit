export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

// Cantidad de asistencias por día, para los últimos 7 días (incluye hoy),
// en el calendario de Chile — mismo criterio de zona horaria que el resto
// de la app (ver lib/utils.ts) para que el gráfico coincida con lo que la
// gente realmente ve marcar en la pantalla de acceso.
export async function GET() {
  try {
    const filas = await sql`
      SELECT
        (timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago')::date AS dia,
        COUNT(*)::int AS total
      FROM asistencias
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY dia
      ORDER BY dia ASC
    `;
    return NextResponse.json(filas);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
