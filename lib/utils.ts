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
  const hoy = new Date();
  const v = new Date(vencimiento);
  const diff = (v.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'vencido';
  if (diff <= 7) return 'proximo';
  return 'activo';
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}
