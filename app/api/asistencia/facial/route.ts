export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

function distanciaFacial(d1: number[], d2: number[]): number {
  if (!d1 || !d2 || d1.length !== d2.length) return Infinity;
  return Math.sqrt(d1.reduce((sum, v, i) => sum + Math.pow(v - d2[i], 2), 0));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { descriptor } = body;

    if (!descriptor || !Array.isArray(descriptor)) {
      return NextResponse.json({ error: 'Descriptor facial inválido' }, { status: 400 });
    }

    const usuarios = await sql`
      SELECT id, nombre, rut, foto, foto_descriptor, plan_tipo, plan_vencimiento, activo
      FROM usuarios 
      WHERE foto_descriptor IS NOT NULL AND activo = true
    `;

    let mejorMatch = null;
    let menorDistancia = Infinity;
    const UMBRAL = 0.5;

    for (const usuario of usuarios) {
      try {
        const descriptorGuardado = JSON.parse(usuario.foto_descriptor);
        const distancia = distanciaFacial(descriptor, descriptorGuardado);
        if (distancia < menorDistancia && distancia < UMBRAL) {
          menorDistancia = distancia;
          mejorMatch = usuario;
        }
      } catch {}
    }

    if (!mejorMatch) {
      return NextResponse.json({ encontrado: false, mensaje: 'Rostro no reconocido' });
    }

    const hoy = new Date();
    const vencimiento = new Date(mejorMatch.plan_vencimiento);
    const planVigente = vencimiento >= hoy;

    await sql`
      INSERT INTO asistencias (usuario_id, metodo, exitoso)
      VALUES (${mejorMatch.id}, 'facial', ${planVigente})
    `;

    return NextResponse.json({
      encontrado: true,
      usuario: mejorMatch,
      planVigente,
      confianza: Math.round((1 - menorDistancia / UMBRAL) * 100),
      mensaje: planVigente 
        ? `¡Bienvenido/a, ${mejorMatch.nombre}!` 
        : `Plan vencido — ${mejorMatch.nombre}`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
