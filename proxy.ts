import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'clubfit_admin_session';
export const SESSION_VALUE = process.env.ADMIN_SESSION_SECRET || 'clubfit-secret-2026-pala';

// LOGIN TEMPORALMENTE DESACTIVADO — todas las rutas son públicas
// Reactivar cuando Neon vuelva a estar disponible:
//   1. Descomentar la función estaAutenticado
//   2. Restaurar los bloques de verificación en proxy()
//   3. Restaurar el matcher completo

export function proxy(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
