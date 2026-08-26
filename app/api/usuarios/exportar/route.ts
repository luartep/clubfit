export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import * as XLSX from 'xlsx';
import { planLabel, mensajeVencimiento } from '@/lib/utils';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

export async function GET() {
  try {
    const usuarios = await sql`SELECT * FROM usuarios ORDER BY nombre ASC`;
    const hoy = new Date();

    const filas = usuarios.map((u: any) => {
      const vencimiento = new Date(u.plan_vencimiento);
      const estado = !u.activo ? 'Inactivo' : vencimiento >= hoy ? 'Activo' : 'Vencido';
      return {
        'Nombre': u.nombre,
        'RUT': u.rut,
        'Email': u.email || '',
        'Teléfono': u.telefono || '',
        'Plan': planLabel(u.plan_tipo),
        'Fecha de Ingreso': u.plan_inicio ? new Date(u.plan_inicio).toLocaleDateString('es-CL') : '',
        'Fecha de Término': u.plan_vencimiento ? new Date(u.plan_vencimiento).toLocaleDateString('es-CL') : '',
        'Estado': estado,
        'Vencimiento': mensajeVencimiento(u.plan_vencimiento),
      };
    });

    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [
      { wch: 28 }, // Nombre
      { wch: 14 }, // RUT
      { wch: 26 }, // Email
      { wch: 16 }, // Teléfono
      { wch: 14 }, // Plan
      { wch: 16 }, // Fecha de Ingreso
      { wch: 16 }, // Fecha de Término
      { wch: 12 }, // Estado
      { wch: 22 }, // Vencimiento
    ];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Usuarios');
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });

    const fecha = hoy.toISOString().split('T')[0];
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="usuarios-clubfit-${fecha}.xlsx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
