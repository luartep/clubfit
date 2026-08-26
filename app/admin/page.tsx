'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FormUsuario from '@/components/admin/FormUsuario';
import { planLabel, estadoPlan, formatDate, mensajeVencimiento, calcularRenovacion, linkWhatsapp } from '@/lib/utils';

export default function AdminPage() {
  const router = useRouter();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [usuarioEditar, setUsuarioEditar] = useState<any>(null);
  const [asistencias, setAsistencias] = useState<any[]>([]);
  const [asistenciasHoy, setAsistenciasHoy] = useState<any[]>([]);
  const [tab, setTab] = useState<'usuarios' | 'asistencias'>('usuarios');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'activo' | 'proximo' | 'vencido'>('todos');

  const cargarUsuarios = useCallback(async () => {
    const res = await fetch(`/api/usuarios${busqueda ? `?buscar=${busqueda}` : ''}`);
    const data = await res.json();
    setUsuarios(Array.isArray(data) ? data : []);
    setCargando(false);
  }, [busqueda]);

  // Historial que se muestra en la pestaña "Historial de Accesos" (los últimos 100)
  const cargarAsistencias = useCallback(async () => {
    const res = await fetch('/api/asistencia?limit=100');
    const data = await res.json();
    setAsistencias(Array.isArray(data) ? data : []);
  }, []);

  // Todas las asistencias del día — sin límite — para el contador "Asistencias Hoy"
  const cargarAsistenciasHoy = useCallback(async () => {
    const res = await fetch('/api/asistencia?hoy=true');
    const data = await res.json();
    setAsistenciasHoy(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { cargarUsuarios(); }, [cargarUsuarios]);
  useEffect(() => { cargarAsistenciasHoy(); }, [cargarAsistenciasHoy]);
  useEffect(() => { if (tab === 'asistencias') cargarAsistencias(); }, [tab, cargarAsistencias]);

  // Actualización en vivo: refresca usuarios y asistencias cada pocos segundos
  // para que el panel se ponga al día solo si alguien ingresa desde la pantalla de acceso.
  useEffect(() => {
    const id = setInterval(() => {
      cargarUsuarios();
      cargarAsistenciasHoy();
      if (tab === 'asistencias') cargarAsistencias();
    }, 8000);
    return () => clearInterval(id);
  }, [cargarUsuarios, cargarAsistenciasHoy, cargarAsistencias, tab]);

  const eliminar = async (id: number) => {
    if (!confirm('¿Eliminar este usuario?')) return;
    await fetch(`/api/usuarios/${id}`, { method: 'DELETE' });
    cargarUsuarios();
  };

  const toggleActivo = async (usuario: any) => {
    await fetch(`/api/usuarios/${usuario.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !usuario.activo }),
    });
    cargarUsuarios();
  };

  const cerrarSesion = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  const descargarExcel = (tipo: 'usuarios' | 'asistencias') => {
    window.location.href = tipo === 'usuarios' ? '/api/usuarios/exportar' : '/api/asistencia/exportar';
  };

  const renovarPlan = async (usuario: any) => {
    const { nuevoInicio, nuevoVencimiento } = calcularRenovacion(usuario.plan_vencimiento, usuario.plan_tipo);
    const confirmacion = confirm(
      `Renovar el plan de ${usuario.nombre} (${planLabel(usuario.plan_tipo)})?\nNueva fecha de término: ${formatDate(nuevoVencimiento)}`
    );
    if (!confirmacion) return;

    await fetch(`/api/usuarios/${usuario.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planInicio: nuevoInicio, planVencimiento: nuevoVencimiento }),
    });
    cargarUsuarios();
  };

  const reiniciarConteo = async (todo: boolean) => {
    const confirmacion = todo
      ? '¿Borrar TODO el historial de asistencias? Esta acción no se puede deshacer.'
      : '¿Reiniciar el conteo de asistencias de hoy? Se borrarán solo los registros de hoy.';
    if (!confirm(confirmacion)) return;

    const res = await fetch(`/api/asistencia${todo ? '?todo=true' : ''}`, { method: 'DELETE' });
    if (res.ok) {
      cargarAsistenciasHoy();
      cargarAsistencias();
    } else {
      alert('No se pudo reiniciar el conteo. Intenta de nuevo.');
    }
  };

  // Stats
  const activos = usuarios.filter(u => estadoPlan(u.plan_vencimiento) === 'activo').length;
  const porVencer = usuarios.filter(u => estadoPlan(u.plan_vencimiento) === 'proximo').length;
  const vencidos = usuarios.filter(u => estadoPlan(u.plan_vencimiento) === 'vencido').length;
  const hoyAsistencias = asistenciasHoy.length;

  const usuariosMostrados = filtroEstado === 'todos'
    ? usuarios
    : usuarios.filter(u => estadoPlan(u.plan_vencimiento) === filtroEstado);


  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a' }}>
      {/* Header */}
      <header style={{
        background: '#141414', borderBottom: '1px solid #1e1e1e',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: '#e50914', letterSpacing: '-1px' }}>CLUBFIT</span>
          <span style={{ color: '#444', fontSize: '1.2rem' }}>|</span>
          <span style={{ color: '#888', fontSize: '0.9rem' }}>Panel Admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link href="/pantalla" style={{
            background: '#1e1e1e', color: '#e50914', border: '1px solid #2a2a2a',
            borderRadius: '8px', padding: '0.5rem 1.2rem', textDecoration: 'none',
            fontSize: '0.85rem', fontWeight: 600,
          }}>
            → Pantalla Acceso
          </Link>
          <button onClick={cerrarSesion} style={{
            background: '#1e1e1e', color: '#888', border: '1px solid #2a2a2a',
            borderRadius: '8px', padding: '0.5rem 1.2rem', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: 600,
          }}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <main style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          {[
            { label: 'Total Usuarios', valor: usuarios.length, color: '#e50914', icon: '👥' },
            { label: 'Planes Activos', valor: activos, color: '#00e096', icon: '✅' },
            { label: 'Por Vencer', valor: porVencer, color: '#ffaa00', icon: '⏳' },
            { label: 'Planes Vencidos', valor: vencidos, color: '#ff3d71', icon: '⚠️' },
            { label: 'Asistencias Hoy', valor: hoyAsistencias, color: '#ffaa00', icon: '📍' },
          ].map(s => (
            <div key={s.label} style={{
              background: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px',
              padding: '1.5rem', borderTop: `3px solid ${s.color}`,
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{s.icon}</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: s.color }}>{s.valor}</div>
              <div style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.3rem' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {(['usuarios', 'asistencias'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? '#e50914' : '#1e1e1e',
              color: tab === t ? '#ffffff' : '#888',
              border: '1px solid #2a2a2a', borderRadius: '8px',
              padding: '0.6rem 1.5rem', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.9rem', textTransform: 'capitalize',
            }}>
              {t === 'usuarios' ? '👥 Usuarios' : '📋 Historial de Accesos'}
            </button>
          ))}
        </div>

        {tab === 'usuarios' && (
          <>
            {/* Filtros rápidos por estado */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {([
                { valor: 'todos', label: `Todos (${usuarios.length})`, color: '#e50914' },
                { valor: 'activo', label: `Activos (${activos})`, color: '#00e096' },
                { valor: 'proximo', label: `Por vencer (${porVencer})`, color: '#ffaa00' },
                { valor: 'vencido', label: `Vencidos (${vencidos})`, color: '#ff3d71' },
              ] as const).map(f => (
                <button key={f.valor} onClick={() => setFiltroEstado(f.valor)} style={{
                  background: filtroEstado === f.valor ? f.color : '#141414',
                  color: filtroEstado === f.valor ? '#ffffff' : f.color,
                  border: `1px solid ${f.color}`, borderRadius: '20px',
                  padding: '0.4rem 1rem', cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.8rem',
                }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Barra de búsqueda y acciones */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="🔍 Buscar por nombre o RUT..."
                style={{
                  flex: 1, background: '#141414', border: '1px solid #2a2a2a',
                  borderRadius: '8px', padding: '0.75rem 1rem', color: '#ffffff',
                  fontSize: '0.95rem', outline: 'none', minWidth: '200px',
                }}
              />
              <button
                onClick={() => descargarExcel('usuarios')}
                style={{
                  background: '#1e1e1e', color: '#ffffff', border: '1px solid #2a2a2a',
                  borderRadius: '8px', padding: '0.75rem 1.5rem', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap',
                }}
              >
                📥 Descargar Excel
              </button>
              <button
                onClick={() => { setMostrarForm(true); setUsuarioEditar(null); }}
                style={{
                  background: '#e50914', color: '#ffffff', border: 'none',
                  borderRadius: '8px', padding: '0.75rem 1.5rem', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.95rem', whiteSpace: 'nowrap',
                }}
              >
                + Agregar Usuario
              </button>
            </div>

            {/* Tabla */}
            <div style={{
              background: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px',
              overflow: 'hidden',
            }}>
              {cargando ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>
                  ⏳ Cargando usuarios...
                </div>
              ) : usuariosMostrados.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>
                  {usuarios.length === 0 ? 'No hay usuarios registrados aún.' : 'No hay usuarios con este filtro.'}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                      {['Foto', 'Nombre', 'RUT', 'Plan', 'Vencimiento', 'Estado', 'Acciones'].map(h => (
                        <th key={h} style={{
                          padding: '1rem', textAlign: 'left', color: '#888',
                          fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosMostrados.map((u, i) => {
                      const estado = estadoPlan(u.plan_vencimiento);
                      const colores: Record<string, string> = { activo: '#00e096', proximo: '#ffaa00', vencido: '#ff3d71' };
                      const mensajeWa = estado === 'vencido'
                        ? `Hola ${u.nombre}, tu plan en ClubFit venció el ${formatDate(u.plan_vencimiento)}. ¡Te esperamos para renovar! 💪`
                        : `Hola ${u.nombre}, te recordamos que tu plan en ClubFit vence el ${formatDate(u.plan_vencimiento)}. ¡Te esperamos! 💪`;
                      const wa = linkWhatsapp(u.telefono, mensajeWa);
                      return (
                        <tr key={u.id} style={{
                          borderBottom: '1px solid #1a1a1a',
                          opacity: u.activo ? 1 : 0.5,
                          background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                        }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{
                              width: '40px', height: '40px', borderRadius: '8px',
                              overflow: 'hidden', background: '#1e1e1e',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {u.foto ? (
                                <img src={u.foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : <span>👤</span>}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{u.nombre}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#888', fontFamily: 'monospace' }}>{u.rut}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{
                              background: '#1e1e1e', borderRadius: '6px',
                              padding: '0.25rem 0.75rem', fontSize: '0.85rem',
                              color: '#e50914',
                            }}>
                              {planLabel(u.plan_tipo)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: '#888' }}>
                            <div>{formatDate(u.plan_vencimiento)}</div>
                            <div style={{ fontSize: '0.75rem', color: colores[estado], marginTop: '0.15rem' }}>
                              {mensajeVencimiento(u.plan_vencimiento)}
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{
                              color: colores[estado], fontSize: '0.85rem', fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                              <span style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: colores[estado], display: 'inline-block',
                              }} />
                              {estado === 'activo' ? 'Activo' : estado === 'proximo' ? 'Por vencer' : 'Vencido'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button onClick={() => renovarPlan(u)} title="Renovar plan" style={{
                                background: '#1e1e1e', color: '#00e096', border: '1px solid #00e096',
                                borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                                fontSize: '0.8rem',
                              }}>🔄</button>
                              {wa && (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Avisar por WhatsApp"
                                  style={{
                                    background: '#1e1e1e', color: '#25D366', border: '1px solid #25D366',
                                    borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                                    fontSize: '0.8rem', textDecoration: 'none', display: 'inline-flex',
                                    alignItems: 'center',
                                  }}
                                >💬</a>
                              )}
                              <button onClick={() => { setUsuarioEditar(u); setMostrarForm(true); }} style={{
                                background: '#1e1e1e', color: '#ffffff', border: '1px solid #2a2a2a',
                                borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                                fontSize: '0.8rem',
                              }}>✏️</button>
                              <button onClick={() => toggleActivo(u)} style={{
                                background: '#1e1e1e', color: u.activo ? '#ffaa00' : '#00e096',
                                border: `1px solid ${u.activo ? '#ffaa00' : '#00e096'}`,
                                borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                                fontSize: '0.8rem',
                              }}>
                                {u.activo ? '⏸' : '▶'}
                              </button>
                              <button onClick={() => eliminar(u.id)} style={{
                                background: '#1e1e1e', color: '#ff3d71', border: '1px solid #ff3d71',
                                borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                                fontSize: '0.8rem',
                              }}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'asistencias' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button onClick={() => descargarExcel('asistencias')} style={{
                background: '#1e1e1e', color: '#ffffff', border: '1px solid #2a2a2a',
                borderRadius: '8px', padding: '0.6rem 1.2rem', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap',
              }}>
                📥 Descargar Excel
              </button>
              <button onClick={() => reiniciarConteo(false)} style={{
                background: '#1e1e1e', color: '#ffaa00', border: '1px solid #ffaa00',
                borderRadius: '8px', padding: '0.6rem 1.2rem', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap',
              }}>
                🔄 Reiniciar conteo de hoy
              </button>
              <button onClick={() => reiniciarConteo(true)} style={{
                background: '#1e1e1e', color: '#ff3d71', border: '1px solid #ff3d71',
                borderRadius: '8px', padding: '0.6rem 1.2rem', cursor: 'pointer',
                fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap',
              }}>
                🗑️ Borrar todo el historial
              </button>
            </div>
            <div style={{
              background: '#141414', border: '1px solid #1e1e1e', borderRadius: '12px',
              overflow: 'hidden',
            }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                  {['Fecha y Hora', 'Usuario', 'RUT', 'Método', 'Resultado'].map(h => (
                    <th key={h} style={{
                      padding: '1rem', textAlign: 'left', color: '#888',
                      fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {asistencias.map((a, i) => (
                  <tr key={a.id} style={{
                    borderBottom: '1px solid #1a1a1a',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}>
                    <td style={{ padding: '0.75rem 1rem', color: '#888', fontFamily: 'monospace' }}>
                      {new Date(a.timestamp).toLocaleString('es-CL')}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{a.nombre}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#888', fontFamily: 'monospace' }}>{a.rut}</td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{
                        background: '#1e1e1e', borderRadius: '6px',
                        padding: '0.2rem 0.6rem', fontSize: '0.8rem', color: '#e50914',
                      }}>
                        {a.metodo === 'facial' ? '🤳 Facial' : a.metodo === 'huella' ? '👆 Huella' : '✍️ Manual'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span style={{ color: a.exitoso ? '#00e096' : '#ff3d71', fontWeight: 600 }}>
                        {a.exitoso ? '✓ Ingresó' : '✗ Denegado'}
                      </span>
                    </td>
                  </tr>
                ))}
                {asistencias.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#888' }}>
                      No hay registros de asistencia aún.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </>
        )}
      </main>

      {mostrarForm && (
        <FormUsuario
          onGuardado={() => { setMostrarForm(false); cargarUsuarios(); }}
          onCerrar={() => setMostrarForm(false)}
          usuarioEditar={usuarioEditar}
        />
      )}
    </div>
  );
}
