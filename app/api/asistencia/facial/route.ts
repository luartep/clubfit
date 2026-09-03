export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { diasParaVencer } from '@/lib/utils';

const sql = neon(process.env.POSTGRES_URL ?? process.env.DATABASE_URL!);

// Mismo cooldown que el registro manual: evita marcar dos veces a la
// misma persona en un lapso muy corto (el escaneo facial reintenta cada 1.5s).
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos

// 0.6 es el umbral estándar recomendado por face-api.js para face-recognition-net
// (distancia euclidiana). Con 0.5 se rechazaban caras válidas por variaciones
// normales de luz/ángulo entre el registro y el ingreso.
const UMBRAL = 0.6;

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

    // Antes: `new Date(mejorMatch.plan_vencimiento) >= new Date()` — comparaba
    // una fecha DATE (medianoche UTC) contra el instante actual, lo que
    // rechazaba a alguien como "vencido" desde medianoche UTC de su día de
    // término (varias horas antes de medianoche real en Chile). Ahora se
    // compara por día calendario local: el plan sigue vigente durante TODO
    // el día en que vence.
    const planVigente = diasParaVencer(mejorMatch.plan_vencimiento) >= 0;

    // Chequeo de duplicado reciente
    const ultimas = await sql`
      SELECT timestamp FROM asistencias
      WHERE usuario_id = ${mejorMatch.id}
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    if (ultimas.length) {
      const msDesdeUltima = Date.now() - new Date(ultimas[0].timestamp).getTime();
      if (msDesdeUltima < COOLDOWN_MS) {
        return NextResponse.json({
          encontrado: true,
          duplicado: true,
          usuario: mejorMatch,
          planVigente,
          mensaje: `${mejorMatch.nombre} ya registró su ingreso hace instantes`,
        });
      }
    }

    await sql`
      INSERT INTO asistencias (usuario_id, metodo, exitoso)
      VALUES (${mejorMatch.id}, 'facial', ${planVigente})
    `;

    return NextResponse.json({
      encontrado: true,
      usuario: mejorMatch,
      planVigente,
      confianza: Math.max(0, Math.round((1 - menorDistancia / UMBRAL) * 100)),
      mensaje: planVigente 
        ? `¡Bienvenido/a, ${mejorMatch.nombre}!` 
        : `Plan vencido — ${mejorMatch.nombre}`
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
