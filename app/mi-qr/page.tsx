'use client';
import { useState } from 'react';
import Link from 'next/link';
import { formatearRut, validarRut, diasParaVencer, planLabel, formatDate } from '@/lib/utils';
import { generarImagenQR, descargarQR } from '@/lib/qr';

export default function MiQRPage() {
  const [rut, setRut] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [usuario, setUsuario] = useState<any>(null);
  const [previewQR, setPreviewQR] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  const buscar = async () => {
    const rutLimpio = rut.trim();
    if (!rutLimpio) return;

    if (!validarRut(rutLimpio)) {
      setError('Ese RUT no es válido — revisa los números');
      setUsuario(null);
      setPreviewQR(null);
      return;
    }

    setBuscando(true);
    setError('');
    setUsuario(null);
    setPreviewQR(null);
    try {
      const res = await fetch(`/api/usuarios?rut=${encodeURIComponent(rutLimpio)}`);
      const data = await res.json();
      if (!data || !data.id) {
        setError('No encontramos un socio con ese RUT. Revisa que esté bien escrito, o consulta en recepción.');
        return;
      }
      setUsuario(data);
      const imagen = await generarImagenQR(data);
      setPreviewQR(imagen);
    } catch {
      setError('Error de conexión — intenta de nuevo en un momento');
    } finally {
      setBuscando(false);
    }
  };

  const descargar = async () => {
    if (!usuario) return;
    setDescargando(true);
    try {
      await descargarQR(usuario);
    } catch {
      alert('No se pudo descargar el código. Intenta de nuevo.');
    } finally {
      setDescargando(false);
    }
  };

  // Mismo criterio de color que el resto de la app: verde con margen,
  // amarillo cerca del vencimiento (10 días o menos), rojo si ya venció.
  const colorDias = (dias: number) => {
    if (dias <= 0) return '#ff3d71';
    if (dias <= 10) return '#ffaa00';
    return '#00e096';
  };
  const textoDias = (dias: number) => {
    if (dias < 0) return `Tu plan venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
    if (dias === 0) return 'Tu plan vence hoy';
    return `Te quedan ${dias} día${dias === 1 ? '' : 's'} de tu plan`;
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}>
      <Link href="/" style={{
        position: 'absolute', top: '1.5rem', left: '1.5rem',
        color: '#888', textDecoration: 'none', fontSize: '0.9rem',
      }}>
        ← Volver
      </Link>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#e50914', letterSpacing: '-1px' }}>
          CLUBFIT
        </div>
        <p style={{ color: '#888', marginTop: '0.4rem', fontSize: '1rem' }}>
          Descarga tu código QR de ingreso
        </p>
      </div>

      <div style={{
        background: '#141414', border: '1px solid #2a2a2a', borderRadius: '16px',
        padding: '2rem', width: '100%', maxWidth: '380px',
      }}>
        <label style={{
          display: 'block', color: '#ccc', fontSize: '0.85rem', marginBottom: '0.5rem',
        }}>
          Ingresa tu RUT
        </label>
        <input
          value={rut}
          onChange={e => { setRut(formatearRut(e.target.value)); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && buscar()}
          placeholder="12.345.678-9"
          style={{
            width: '100%', background: '#1e1e1e', border: '1px solid #2a2a2a',
            borderRadius: '8px', padding: '0.85rem 1rem', color: '#ffffff',
            fontSize: '1.1rem', outline: 'none', textAlign: 'center',
            fontFamily: 'monospace', letterSpacing: '1.5px', boxSizing: 'border-box',
            marginBottom: '1rem',
          }}
        />

        <button
          onClick={buscar}
          disabled={buscando || !rut}
          style={{
            width: '100%', background: rut ? '#e50914' : '#1e1e1e',
            color: rut ? '#ffffff' : '#888', border: 'none', borderRadius: '8px',
            padding: '0.85rem', fontWeight: 700, fontSize: '1rem',
            cursor: rut && !buscando ? 'pointer' : 'default',
            opacity: buscando ? 0.7 : 1,
          }}
        >
          {buscando ? '⏳ Buscando...' : '🔍 Buscar mi código'}
        </button>

        {error && (
          <p style={{ color: '#ff3d71', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>
            {error}
          </p>
        )}

        {usuario && previewQR && (
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#00e096', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              ¡Hola, {usuario.nombre}! 👋
            </p>

            {/* Días restantes del plan — se muestra ANTES del QR, no dentro de la imagen */}
            <div style={{
              background: '#1e1e1e', border: `1px solid ${colorDias(diasParaVencer(usuario.plan_vencimiento))}`,
              borderRadius: '10px', padding: '0.85rem', marginBottom: '1.25rem',
            }}>
              <div style={{
                color: colorDias(diasParaVencer(usuario.plan_vencimiento)),
                fontWeight: 800, fontSize: '1.15rem',
              }}>
                {textoDias(diasParaVencer(usuario.plan_vencimiento))}
              </div>
              <div style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.3rem' }}>
                Plan {planLabel(usuario.plan_tipo)} — vence el {formatDate(usuario.plan_vencimiento)}
              </div>
            </div>

            <img src={previewQR} alt="Tu código QR" style={{
              width: '100%', maxWidth: '260px', borderRadius: '12px', border: '1px solid #2a2a2a',
            }} />
            <button
              onClick={descargar}
              disabled={descargando}
              style={{
                width: '100%', background: '#1e1e1e', color: '#ffffff',
                border: '1px solid #2a2a2a', borderRadius: '8px',
                padding: '0.85rem', fontWeight: 700, fontSize: '1rem',
                cursor: descargando ? 'default' : 'pointer', marginTop: '1rem',
                opacity: descargando ? 0.7 : 1,
              }}
            >
              {descargando ? '⏳ Generando...' : '📥 Descargar mi QR'}
            </button>
            <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '1rem', lineHeight: 1.5 }}>
              Guarda esta imagen en tu celular y muéstrala en el ingreso del
              gimnasio si la cámara no te reconoce por tu rostro.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
