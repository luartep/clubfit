export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import * as XLSX from 'xlsx';
import { hoyISO } from '@/lib/utils';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

export async function GET() {
  try {
    const asistencias = await sql`
      SELECT a.*, u.nombre, u.rut FROM asistencias a
      JOIN usuarios u ON a.usuario_id = u.id
      ORDER BY a.timestamp DESC
    `;

    const filas = asistencias.map((a: any) => ({
      // Se fija timeZone explícito: el servidor corre en UTC, así que sin esto
      // las horas de ingreso saldrían todas corridas (ej. una entrada a las
      // 9:00 am en Chile aparecería como "13:00" en el Excel).
      'Fecha y Hora': new Date(a.timestamp).toLocaleString('es-CL', { timeZone: 'America/Santiago' }),
      'Nombre': a.nombre,
      'RUT': a.rut,
      'Método': a.metodo === 'facial' ? 'Facial' : a.metodo === 'huella' ? 'Huella' : 'Manual',
      'Resultado': a.exitoso ? 'Ingresó' : 'Denegado',
    }));

    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [
      { wch: 20 }, // Fecha y Hora
      { wch: 28 }, // Nombre
      { wch: 14 }, // RUT
      { wch: 12 }, // Método
      { wch: 12 }, // Resultado
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Asistencias');
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="asistencias-clubfit-${hoyISO()}.xlsx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
