// Convierte una fecha "de solo día" (ej. una columna DATE de la base de
// datos, o el string ISO que llega desde la API) a un Date en medianoche
// LOCAL, en vez de medianoche UTC. Esto es importante: un valor como
// "2026-08-31" (sin hora) se interpreta por spec como UTC, así que en
// Chile (UTC-3/UTC-4) `new Date("2026-08-31")` cae en 30-08-2026 20:00
// hora local — un día ANTES de lo que el admin realmente eligió. Todas las
// comparaciones de "cuántos días faltan" o "el plan sigue vigente" deben
// pasar por acá para no restar un día de más.
export function soloFechaLocal(valor: string | Date): Date {
  const iso = typeof valor === 'string' ? valor : valor.toISOString();
  const soloFecha = iso.split('T')[0]; // 'YYYY-MM-DD'
  return new Date(soloFecha + 'T00:00:00');
}

// El gimnasio opera en Chile, pero el servidor (Vercel) corre en UTC por
// defecto — no en horario de Chile. Eso significa que, aproximadamente
// entre las 20-21h y la medianoche (hora de Chile), el servidor ya
// considera que es "mañana" mientras en Chile todavía es "hoy". Para que
// el cálculo de días/vigencia sea correcto sin importar en qué zona
// horaria esté el servidor, se obtiene la fecha calendario real de Chile
// con una zona horaria explícita (Intl), en vez de depender de la zona
// horaria "ambiente" del proceso.
const ZONA_HORARIA_APP = 'America/Santiago';

function hoyEnZonaApp(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA_APP }).format(new Date());
  return new Date(ymd + 'T00:00:00');
}

// Validar y formatear RUT chileno
export function validarRut(rut: string): boolean {
  const rutLimpio = rut.replace(/[^0-9kK]/g, '');
  if (rutLimpio.length < 2) return false;
  
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1).toLowerCase();
  
  let suma = 0;
  let multiplo = 2;
  
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }
  
  const dvEsperado = 11 - (suma % 11);
  const dvCalculado = dvEsperado === 11 ? '0' : dvEsperado === 10 ? 'k' : dvEsperado.toString();
  
  return dv === dvCalculado;
}

export function formatearRut(rut: string): string {
  const rutLimpio = rut.replace(/[^0-9kK]/g, '');
  if (rutLimpio.length < 2) return rut;
  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1).toUpperCase();
  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoFormateado}-${dv}`;
}

// Calcular fecha de vencimiento según plan
export function calcularVencimiento(inicio: Date, planTipo: string): Date {
  const vencimiento = new Date(inicio);
  switch (planTipo) {
    case 'mensual':
      vencimiento.setMonth(vencimiento.getMonth() + 1);
      break;
    case 'trimestral':
      vencimiento.setMonth(vencimiento.getMonth() + 3);
      break;
    case 'semestral':
      vencimiento.setMonth(vencimiento.getMonth() + 6);
      break;
    case 'anual':
      vencimiento.setFullYear(vencimiento.getFullYear() + 1);
      break;
  }
  return vencimiento;
}

export function planLabel(tipo: string): string {
  const labels: Record<string, string> = {
    mensual: '1 Mes',
    trimestral: '3 Meses',
    semestral: '6 Meses',
    anual: 'Anual',
  };
  return labels[tipo] || tipo;
}

export function estadoPlan(vencimiento: string | Date): 'activo' | 'proximo' | 'vencido' {
  const hoy = hoyEnZonaApp();
  const v = soloFechaLocal(vencimiento);
  const diff = (v.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'vencido';
  if (diff <= 7) return 'proximo';
  return 'activo';
}

export function formatDate(date: string | Date): string {
  return soloFechaLocal(date).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

// Días restantes hasta el vencimiento (negativo si ya venció)
export function diasParaVencer(vencimiento: string | Date): number {
  const hoy = hoyEnZonaApp();
  const v = soloFechaLocal(vencimiento);
  return Math.round((v.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

// Mensaje legible de cuánto falta (o cuánto lleva vencido) el plan
export function mensajeVencimiento(vencimiento: string | Date): string {
  const dias = diasParaVencer(vencimiento);
  if (dias < 0) {
    const vencidoHace = Math.abs(dias);
    return vencidoHace === 1 ? 'Venció hace 1 día' : `Venció hace ${vencidoHace} días`;
  }
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}

// Suma la cantidad de meses (o años, para 'anual') del plan a una fecha de inicio,
// devuelve el string YYYY-MM-DD listo para un <input type="date">
export function calcularVencimientoISO(inicio: string, planTipo: string): string {
  const fecha = new Date((inicio || hoyISO()) + 'T00:00:00');
  const vencimiento = calcularVencimiento(fecha, planTipo);
  return vencimiento.toISOString().split('T')[0];
}

// Fecha de hoy en formato YYYY-MM-DD (según el calendario de Chile), para
// valores por defecto de <input type="date"> y para calcular renovaciones.
// OJO: no usar new Date().toISOString().split('T')[0] ni
// getFullYear()/getDate() a secas para esto — ambos dependen de la zona
// horaria del proceso, que en el servidor (Vercel) es UTC y no Chile.
export function hoyISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA_APP }).format(new Date());
}

// Calcula la nueva fecha de vencimiento al renovar un plan.
// Si el plan sigue vigente, extiende desde el vencimiento actual (no se pierden días pagados).
// Si ya venció, el nuevo ciclo parte hoy.
export function calcularRenovacion(vencimientoActual: string | Date, planTipo: string): {
  nuevoInicio: string;
  nuevoVencimiento: string;
} {
  const hoy = hoyISO();
  const yaVencio = diasParaVencer(vencimientoActual) < 0;
  const base = yaVencio ? hoy : soloFechaLocal(vencimientoActual).toISOString().split('T')[0];
  return {
    nuevoInicio: yaVencio ? hoy : base,
    nuevoVencimiento: calcularVencimientoISO(base, planTipo),
  };
}

// Link de WhatsApp con un mensaje prellenado para avisarle a un socio sobre su plan.
// Acepta teléfonos en cualquier formato (+56 9 1234 5678, 912345678, etc.) y los limpia.
export function linkWhatsapp(telefono: string, mensaje: string): string | null {
  const numero = (telefono || '').replace(/\D/g, '');
  if (!numero) return null;
  // Si viene sin código de país, asumimos Chile (+56) para un número móvil de 9 dígitos
  const conCodigo = numero.length === 9 ? `56${numero}` : numero;
  return `https://wa.me/${conCodigo}?text=${encodeURIComponent(mensaje)}`;
}
