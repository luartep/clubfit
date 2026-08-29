export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

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

// Restaura un backup generado por /api/backup/exportar.
// Es "seguro de repetir": los usuarios se actualizan por id (upsert) y las
// asistencias que ya existan (mismo id) no se duplican. Al final, reordena
// las secuencias de autonumeración para que los próximos registros nuevos
// no choquen con los ids restaurados.
export async function POST(req: NextRequest) {
  try {
    await ensureTables();
    const backup = await req.json();

    if (!backup || !Array.isArray(backup.usuarios) || !Array.isArray(backup.asistencias)) {
      return NextResponse.json({ error: 'El archivo no tiene el formato de backup esperado' }, { status: 400 });
    }

    let usuariosRestaurados = 0;
    for (const u of backup.usuarios) {
      if (!u.id || !u.nombre || !u.rut || !u.plan_tipo || !u.plan_inicio || !u.plan_vencimiento) continue;
      await sql`
        INSERT INTO usuarios (
          id, nombre, rut, email, telefono, foto, foto_descriptor,
          plan_tipo, plan_inicio, plan_vencimiento, activo, huella_id, huella_credencial,
          created_at, updated_at
        ) VALUES (
          ${u.id}, ${u.nombre}, ${u.rut}, ${u.email || null}, ${u.telefono || null},
          ${u.foto || null}, ${u.foto_descriptor || null}, ${u.plan_tipo},
          ${u.plan_inicio}, ${u.plan_vencimiento}, ${u.activo ?? true},
          ${u.huella_id || null}, ${u.huella_credencial || null},
          ${u.created_at || new Date().toISOString()}, ${u.updated_at || new Date().toISOString()}
        )
        ON CONFLICT (id) DO UPDATE SET
          nombre = EXCLUDED.nombre, rut = EXCLUDED.rut, email = EXCLUDED.email,
          telefono = EXCLUDED.telefono, foto = EXCLUDED.foto, foto_descriptor = EXCLUDED.foto_descriptor,
          plan_tipo = EXCLUDED.plan_tipo, plan_inicio = EXCLUDED.plan_inicio,
          plan_vencimiento = EXCLUDED.plan_vencimiento, activo = EXCLUDED.activo,
          huella_id = EXCLUDED.huella_id, huella_credencial = EXCLUDED.huella_credencial,
          updated_at = NOW()
      `;
      usuariosRestaurados++;
    }

    let asistenciasRestauradas = 0;
    for (const a of backup.asistencias) {
      if (!a.id || !a.usuario_id || !a.metodo) continue;
      const res = await sql`
        INSERT INTO asistencias (id, usuario_id, metodo, timestamp, exitoso)
        VALUES (${a.id}, ${a.usuario_id}, ${a.metodo}, ${a.timestamp || new Date().toISOString()}, ${a.exitoso ?? true})
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (res.length) asistenciasRestauradas++;
    }

    // Reordenar las secuencias para que el próximo usuario/asistencia nuevo
    // no intente reusar un id que acabamos de restaurar.
    await sql`SELECT setval(pg_get_serial_sequence('usuarios', 'id'), COALESCE((SELECT MAX(id) FROM usuarios), 1))`;
    await sql`SELECT setval(pg_get_serial_sequence('asistencias', 'id'), COALESCE((SELECT MAX(id) FROM asistencias), 1))`;

    return NextResponse.json({
      ok: true,
      usuariosRestaurados,
      asistenciasRestauradas,
      totalUsuariosEnArchivo: backup.usuarios.length,
      totalAsistenciasEnArchivo: backup.asistencias.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
