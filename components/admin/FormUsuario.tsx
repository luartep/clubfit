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

// ─── Helpers WebAuthn ──────────────────────────────────────────────────────────
function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64ToBuf(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

// Texto del usuario que aparecerá en el diálogo del SO al pedir la huella
function nombreParaWebAuthn(nombre: string): Uint8Array {
  return new TextEncoder().encode(nombre.slice(0, 64));
}
// ──────────────────────────────────────────────────────────────────────────────

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
  const [vencimientoManual, setVencimientoManual] = useState(false);
  const [foto, setFoto] = useState<string>(usuarioEditar?.foto || '');
  const [fotoDescriptor, setFotoDescriptor] = useState<number[] | null>(
    usuarioEditar?.foto_descriptor ? JSON.parse(usuarioEditar.foto_descriptor) : null
  );
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState('');

  // Estado huella
  const [huellaRegistrada, setHuellaRegistrada] = useState<boolean>(
    !!(usuarioEditar?.huella_id)
  );
  const [registrandoHuella, setRegistrandoHuella] = useState(false);
  const [mensajeHuella, setMensajeHuella] = useState('');
  const [errorHuella, setErrorHuella] = useState('');

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
      const payload: any = {
        ...form,
        foto: foto || null,
        fotoDescriptor: fotoDescriptor ? JSON.stringify(fotoDescriptor) : null,
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

  // ─── Registrar huella con WebAuthn ───────────────────────────────────────────
  const registrarHuella = async () => {
    if (!usuarioEditar?.id) {
      setErrorHuella('Guarda el usuario primero antes de registrar la huella');
      return;
    }
    setRegistrandoHuella(true);
    setErrorHuella('');
    setMensajeHuella('Pon el dedo en el lector WA28...');

    try {
      // Challenge aleatorio — solo necesitamos crear la credencial, la verificación
      // criptográfica real ocurre en el lector; nosotros guardamos el credentialId
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            // Debe coincidir exactamente con el dominio en producción (Vercel).
            // En localhost funciona con 'localhost'.
            id: window.location.hostname,
            name: 'ClubFit',
          },
          user: {
            // El id del usuario en WebAuthn es un buffer, usamos el id de BD
            id: new TextEncoder().encode(String(usuarioEditar.id)),
            name: usuarioEditar.rut,          // identificador único (RUT)
            displayName: usuarioEditar.nombre,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },   // ES256 (preferido)
            { type: 'public-key', alg: -257 },  // RS256 (fallback Windows Hello)
          ],
          authenticatorSelection: {
            // 'cross-platform' fuerza el uso de dispositivos externos (USB/NFC)
            // como el WA28, en vez de TPM o Windows Hello integrado.
            authenticatorAttachment: 'cross-platform',
            userVerification: 'preferred',
            residentKey: 'discouraged', // no ocupa espacio en el lector
          },
          timeout: 60000,
          // Evitar registrar la misma credencial dos veces si ya hay una
          excludeCredentials: usuarioEditar?.huella_id
            ? (() => {
                const buf = base64ToBuf(usuarioEditar.huella_id);
                return [{ type: 'public-key' as const, id: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer }];
              })()
            : [],
        },
      }) as PublicKeyCredential | null;

      if (!credential) {
        setErrorHuella('No se recibió respuesta del lector');
        setRegistrandoHuella(false);
        setMensajeHuella('');
        return;
      }

      setMensajeHuella('Guardando en el servidor...');

      const credentialId = bufToBase64(credential.rawId);
      // Guardamos también la respuesta completa por si en el futuro se quiere
      // verificar la firma del counter (prevención de replay avanzada).
      const respuesta = credential.response as AuthenticatorAttestationResponse;
      const credencial = JSON.stringify({
        credentialId,
        clientDataJSON: bufToBase64(respuesta.clientDataJSON),
        attestationObject: bufToBase64(respuesta.attestationObject),
      });

      const res = await fetch('/api/huella/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId: usuarioEditar.id,
          credentialId,
          credencial,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al guardar en servidor');
      }

      setHuellaRegistrada(true);
      setMensajeHuella('✓ Huella registrada correctamente');
      // Actualizar el usuarioEditar en memoria para que excludeCredentials funcione
      // si el admin intenta registrar de nuevo en esta misma sesión
      if (usuarioEditar) usuarioEditar.huella_id = credentialId;
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setErrorHuella('El usuario canceló o el lector no respondió a tiempo');
      } else if (err?.name === 'InvalidStateError') {
        setErrorHuella('Esta credencial ya está registrada en el lector');
      } else if (err?.name === 'NotSupportedError') {
        setErrorHuella('El navegador no soporta WebAuthn o el lector no es compatible');
      } else {
        setErrorHuella(err?.message || 'Error al registrar la huella');
      }
      setMensajeHuella('');
    }

    setRegistrandoHuella(false);
  };

  // ─── Eliminar huella ──────────────────────────────────────────────────────────
  const eliminarHuella = async () => {
    if (!usuarioEditar?.id) return;
    if (!confirm('¿Eliminar la huella registrada de este socio?')) return;

    try {
      const res = await fetch(`/api/huella/registrar?usuarioId=${usuarioEditar.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('No se pudo eliminar');
      setHuellaRegistrada(false);
      setMensajeHuella('Huella eliminada');
      if (usuarioEditar) {
        usuarioEditar.huella_id = null;
        usuarioEditar.huella_credencial = null;
      }
    } catch {
      setErrorHuella('No se pudo eliminar la huella');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
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

          {/* ─── Sección Huella Digital ─────────────────────────────────────────── */}
          {usuarioEditar && (
            <div style={{
              marginTop: '1.5rem',
              background: '#0d0d0d',
              border: `1px solid ${huellaRegistrada ? '#00e096' : '#2a2a2a'}`,
              borderRadius: '12px',
              padding: '1rem 1.25rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ color: '#e50914', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  🖐 Huella Digital (WA28)
                </span>
                {huellaRegistrada && (
                  <span style={{ color: '#00e096', fontSize: '0.8rem', fontWeight: 600 }}>✓ Registrada</span>
                )}
              </div>

              <p style={{ color: '#666', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                {huellaRegistrada
                  ? 'Este socio tiene una huella registrada. Puedes reemplazarla o eliminarla.'
                  : 'Registra la huella del socio en el lector WA28 conectado por USB.'
                }
              </p>

              {/* Mensajes de estado */}
              {mensajeHuella && (
                <p style={{
                  color: mensajeHuella.startsWith('✓') ? '#00e096' : '#ffaa00',
                  fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 600,
                }}>
                  {mensajeHuella}
                </p>
              )}
              {errorHuella && (
                <p style={{ color: '#ff3d71', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  ⚠️ {errorHuella}
                </p>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={registrarHuella}
                  disabled={registrandoHuella}
                  style={{
                    background: registrandoHuella ? '#2a2a2a' : '#e50914',
                    color: '#ffffff', border: 'none', borderRadius: '8px',
                    padding: '0.55rem 1.2rem', fontWeight: 700, fontSize: '0.85rem',
                    cursor: registrandoHuella ? 'default' : 'pointer',
                    opacity: registrandoHuella ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                  }}
                >
                  {registrandoHuella ? (
                    <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Leyendo...</>
                  ) : (
                    <>{huellaRegistrada ? '🔄 Reemplazar huella' : '🖐 Registrar huella'}</>
                  )}
                </button>

                {huellaRegistrada && (
                  <button
                    onClick={eliminarHuella}
                    style={{
                      background: 'none', color: '#ff3d71', border: '1px solid #ff3d71',
                      borderRadius: '8px', padding: '0.55rem 1rem', fontWeight: 600,
                      cursor: 'pointer', fontSize: '0.85rem',
                    }}
                  >
                    🗑 Eliminar huella
                  </button>
                )}
              </div>

              <p style={{ color: '#444', fontSize: '0.75rem', marginTop: '0.6rem' }}>
                El lector debe estar conectado por USB. El navegador mostrará un diálogo para confirmar.
              </p>
            </div>
          )}

          {/* Aviso si es usuario nuevo (la huella se registra después de guardar) */}
          {!usuarioEditar && (
            <div style={{
              marginTop: '1.5rem',
              background: '#0d0d0d',
              border: '1px dashed #2a2a2a',
              borderRadius: '12px',
              padding: '0.75rem 1.25rem',
            }}>
              <p style={{ color: '#555', fontSize: '0.8rem' }}>
                🖐 <strong style={{ color: '#888' }}>Huella digital:</strong> Guarda el usuario primero y luego podrás registrar su huella desde el botón de edición.
              </p>
            </div>
          )}

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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
