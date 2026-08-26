import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });

export async function initDB() {
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
    );
    
    CREATE TABLE IF NOT EXISTS asistencias (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id),
      metodo VARCHAR(20) NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW(),
      exitoso BOOLEAN DEFAULT true
    );
  `;
}
