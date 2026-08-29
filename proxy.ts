import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE = 'clubfit_admin_session';
export const SESSION_VALUE = process.env.ADMIN_SESSION_SECRET || 'clubfit-secret-2026-pala';

function estaAutenticado(req: NextRequest): boolean {
  return req.cookies.get(SESSION_COOKIE)?.value === SESSION_VALUE;
}

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Panel de administración (páginas): exige sesión iniciada
  if (pathname.startsWith('/admin')) {
    if (!estaAutenticado(req)) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Exportar Excel de usuarios: solo admin
  if (pathname === '/api/usuarios/exportar') {
    if (!estaAutenticado(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Listado general / alta de usuarios: solo admin.
  // Excepción: la pantalla de acceso pública consulta por RUT exacto (?rut=...)
  // para el ingreso manual, y eso debe seguir funcionando sin sesión.
  if (pathname === '/api/usuarios') {
    const esConsultaPublicaPorRut = req.method === 'GET' && !!searchParams.get('rut');
    if (!esConsultaPublicaPorRut && !estaAutenticado(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Editar / eliminar un usuario puntual: solo admin
  if (pathname.startsWith('/api/usuarios/')) {
    if (!estaAutenticado(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Reiniciar el conteo o exportar el historial de asistencias: solo admin.
  // GET (listado normal) y POST de /api/asistencia quedan públicos porque los usa la pantalla de acceso.
  if (pathname === '/api/asistencia' && req.method === 'DELETE') {
    if (!estaAutenticado(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }
  if (pathname === '/api/asistencia/exportar') {
    if (!estaAutenticado(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Backup y restauración: solo admin
  if (pathname.startsWith('/api/backup/')) {
    if (!estaAutenticado(req)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/usuarios',
    '/api/usuarios/:path*',
    '/api/asistencia',
    '/api/asistencia/exportar',
    '/api/backup/:path*',
  ],
};
