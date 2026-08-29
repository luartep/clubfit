'use client';
import { useState } from 'react';
import { validarRut, formatearRut, planLabel, calcularVencimientoISO, hoyISO } from '@/lib/utils';
import CamaraCaptura from './CamaraCaptura';

interface Props {
  onGuardado: (usuario: any) => void;
  onCerrar: () => void;
  usuarioEditar?: any;
}

const PLANES = [
  { valor: 'mensual', label: '1 Mes' },
  { valor: 'trimestral', label: '3 Meses (Trimestral)' },
  { valor: 'semestral', label: '6 Meses (Semestral)' },
  { valor: 'anual', label: 'Anual' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#1e1e1e', border: '1px solid #2a2a2a',
  borderRadius: '8px', padding: '0.75rem 1rem', color: '#ffffff',
  fontSize: '1rem', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#888', fontSize: '0.85rem',
  marginBottom: '0.4rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px',
};

export default function FormUsuario({ onGuardado, onCerrar, usuarioEditar }: Props) {
  const inicioInicial = usuarioEditar?.plan_inicio
    ? String(usuarioEditar.plan_inicio).split('T')[0]
    : hoyISO();
  const planInicialTipo = usuarioEditar?.plan_tipo || 'mensual';

  const [form, setForm] = useState({
    nombre: usuarioEditar?.nombre || '',
    rut: usuarioEditar?.rut || '',
    email: usuarioEditar?.email || '',
    telefono: usuarioEditar?.telefono || '',
    planTipo: planInicialTipo,
    planInicio: inicioInicial,
    planVencimiento: usuarioEditar?.plan_vencimiento
      ? String(usuarioEditar.plan_vencimiento).split('T')[0]
      : calcularVencimientoISO(inicioInicial, planInicialTipo),
  });
  // Mientras no se edite manualmente la fecha de término, se recalcula
  // automáticamente al cambiar el plan o la fecha de ingreso.
  const [vencimientoManual, setVencimientoManual] = useState(false);
  const [foto, setFoto] = useState<string>(usuarioEditar?.foto || '');
  const [fotoDescriptor, setFotoDescriptor] = useState<number[] | null>(
    usuarioEditar?.foto_descriptor ? JSON.parse(usuarioEditar.foto_descriptor) : null
  );
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'rut') {
      setForm(f => ({ ...f, rut: formatearRut(value) }));
      setErrores(er => ({ ...er, [name]: '' }));
      return;
    }
    if (name === 'planTipo') {
      setForm(f => ({
        ...f,
        planTipo: value,
        planVencimiento: vencimientoManual ? f.planVencimiento : calcularVencimientoISO(f.planInicio, value),
      }));
      setErrores(er => ({ ...er, planTipo: '' }));
      return;
    }
    if (name === 'planInicio') {
      setForm(f => ({
        ...f,
        planInicio: value,
        planVencimiento: vencimientoManual ? f.planVencimiento : calcularVencimientoISO(value, f.planTipo),
      }));
      setErrores(er => ({ ...er, planInicio: '' }));
      return;
    }
    if (name === 'planVencimiento') {
      setVencimientoManual(true);
      setForm(f => ({ ...f, planVencimiento: value }));
      setErrores(er => ({ ...er, planVencimiento: '' }));
      return;
    }
    setForm(f => ({ ...f, [name]: value }));
    setErrores(er => ({ ...er, [name]: '' }));
  };

  const restablecerVencimientoAutomatico = () => {
    setVencimientoManual(false);
    setForm(f => ({ ...f, planVencimiento: calcularVencimientoISO(f.planInicio, f.planTipo) }));
  };

  const validar = () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido';
    if (!form.rut.trim()) {
      e.rut = 'El RUT es requerido';
    } else if (!validarRut(form.rut)) {
      e.rut = 'RUT inválido';
    }
    if (!form.planTipo) e.planTipo = 'Selecciona un plan';
    if (!form.planInicio) e.planInicio = 'La fecha de ingreso es requerida';
    if (!form.planVencimiento) e.planVencimiento = 'La fecha de término es requerida';
    if (form.planInicio && form.planVencimiento && form.planVencimiento < form.planInicio) {
      e.planVencimiento = 'No puede ser anterior al ingreso';
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validar()) return;
    setEnviando(true);
    setErrorGeneral('');

    try {
      const payload = {
        ...form,
        foto: foto || undefined,
        fotoDescriptor: fotoDescriptor ? JSON.stringify(fotoDescriptor) : undefined,
      };

      const url = usuarioEditar ? `/api/usuarios/${usuarioEditar.id}` : '/api/usuarios';
      const method = usuarioEditar ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      onGuardado(data);
    } catch (e: any) {
      setErrorGeneral(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleFotoArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <>
      {mostrarCamara && (
        <CamaraCaptura
          onCaptura={(f, d) => { setFoto(f); setFotoDescriptor(d); setMostrarCamara(false); }}
          onCerrar={() => setMostrarCamara(false)}
        />
      )}

      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: '1rem',
      }}>
        <div style={{
          background: '#141414', borderRadius: '16px', padding: '2rem',
          border: '1px solid #2a2a2a', width: '100%', maxWidth: '600px',
          maxHeight: '90vh', overflowY: 'auto',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <h2 style={{ color: '#e50914', fontSize: '1.3rem', fontWeight: 700 }}>
              {usuarioEditar ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
            </h2>
            <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.5rem' }}>✕</button>
          </div>

          {/* Foto */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div style={{
              width: '100px', height: '100px', borderRadius: '12px', border: '2px dashed #2a2a2a',
              overflow: 'hidden', flexShrink: 0, background: '#1e1e1e',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {foto ? (
                <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '2.5rem' }}>👤</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
              <p style={{ color: '#888', fontSize: '0.85rem' }}>Foto del usuario</p>
              {fotoDescriptor && (
                <p style={{ color: '#00e096', fontSize: '0.8rem' }}>
                  ✓ Descriptor facial guardado ({fotoDescriptor.length} puntos)
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => setMostrarCamara(true)} style={{
                  background: '#e50914', color: '#ffffff', border: 'none',
                  borderRadius: '6px', padding: '0.5rem 1rem', fontWeight: 600,
                  cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  📷 Cámara
                </button>
                <label style={{
                  background: '#1e1e1e', color: '#ffffff', border: '1px solid #2a2a2a',
                  borderRadius: '6px', padding: '0.5rem 1rem', fontWeight: 600,
                  cursor: 'pointer', fontSize: '0.85rem',
                }}>
                  📁 Archivo
                  <input type="file" accept="image/*" onChange={handleFotoArchivo} style={{ display: 'none' }} />
                </label>
                {foto && (
                  <button onClick={() => { setFoto(''); setFotoDescriptor(null); }} style={{
                    background: 'none', color: '#ff3d71', border: '1px solid #ff3d71',
                    borderRadius: '6px', padding: '0.5rem 1rem', fontWeight: 600,
                    cursor: 'pointer', fontSize: '0.85rem',
                  }}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Campos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Nombre Completo *</label>
              <input name="nombre" value={form.nombre} onChange={handleChange} style={{
                ...inputStyle, borderColor: errores.nombre ? '#ff3d71' : '#2a2a2a',
              }} placeholder="Juan Pérez González" />
              {errores.nombre && <p style={{ color: '#ff3d71', fontSize: '0.8rem', marginTop: '0.3rem' }}>{errores.nombre}</p>}
            </div>

            <div>
              <label style={labelStyle}>RUT *</label>
              <input name="rut" value={form.rut} onChange={handleChange} style={{
                ...inputStyle, borderColor: errores.rut ? '#ff3d71' : '#2a2a2a',
              }} placeholder="12.345.678-9" />
              {errores.rut && <p style={{ color: '#ff3d71', fontSize: '0.8rem', marginTop: '0.3rem' }}>{errores.rut}</p>}
            </div>

            <div>
              <label style={labelStyle}>Plan *</label>
              <select name="planTipo" value={form.planTipo} onChange={handleChange} style={{
                ...inputStyle, borderColor: errores.planTipo ? '#ff3d71' : '#2a2a2a',
              }}>
                {PLANES.map(p => (
                  <option key={p.valor} value={p.valor}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Fecha de Ingreso *</label>
              <input type="date" name="planInicio" value={form.planInicio} onChange={handleChange} style={{
                ...inputStyle, borderColor: errores.planInicio ? '#ff3d71' : '#2a2a2a', colorScheme: 'dark',
              }} />
              {errores.planInicio && <p style={{ color: '#ff3d71', fontSize: '0.8rem', marginTop: '0.3rem' }}>{errores.planInicio}</p>}
            </div>

            <div>
              <label style={labelStyle}>Fecha de Término *</label>
              <input type="date" name="planVencimiento" value={form.planVencimiento} onChange={handleChange} style={{
                ...inputStyle, borderColor: errores.planVencimiento ? '#ff3d71' : '#2a2a2a', colorScheme: 'dark',
              }} />
              {errores.planVencimiento && <p style={{ color: '#ff3d71', fontSize: '0.8rem', marginTop: '0.3rem' }}>{errores.planVencimiento}</p>}
              {vencimientoManual ? (
                <button type="button" onClick={restablecerVencimientoAutomatico} style={{
                  background: 'none', border: 'none', color: '#e50914', cursor: 'pointer',
                  fontSize: '0.75rem', marginTop: '0.3rem', padding: 0, textDecoration: 'underline',
                }}>
                  ↺ Calcular automáticamente según el plan
                </button>
              ) : (
                <p style={{ color: '#888', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                  Se calcula sola según el plan — puedes editarla si es necesario
                </p>
              )}
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input name="email" value={form.email} onChange={handleChange} style={inputStyle}
                placeholder="juan@ejemplo.com" type="email" />
            </div>

            <div>
              <label style={labelStyle}>Teléfono</label>
              <input name="telefono" value={form.telefono} onChange={handleChange} style={inputStyle}
                placeholder="+56 9 1234 5678" />
            </div>
          </div>

          {errorGeneral && (
            <div style={{
              background: 'rgba(255,61,113,0.1)', border: '1px solid #ff3d71',
              borderRadius: '8px', padding: '0.75rem', marginTop: '1rem', color: '#ff3d71',
            }}>
              ⚠️ {errorGeneral}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
            <button onClick={onCerrar} style={{
              background: '#1e1e1e', color: '#ffffff', border: '1px solid #2a2a2a',
              borderRadius: '8px', padding: '0.75rem 1.5rem', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.95rem',
            }}>
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={enviando} style={{
              background: '#e50914', color: '#ffffff', border: 'none',
              borderRadius: '8px', padding: '0.75rem 2rem', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.95rem', opacity: enviando ? 0.7 : 1,
            }}>
              {enviando ? '⏳ Guardando...' : usuarioEditar ? '✓ Actualizar' : '✓ Registrar'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
