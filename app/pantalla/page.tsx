'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatearRut, validarRut, planLabel, formatDate, diasParaVencer } from '@/lib/utils';

type Modo = 'espera' | 'facial' | 'manual' | 'huella';
type ResultadoTipo = 'bienvenido' | 'vencido' | 'duplicado' | 'no_encontrado' | 'error';

interface Notificacion {
  id: number;
  tipo: ResultadoTipo;
  usuario?: any;
  mensaje?: string;
  planVigente?: boolean;
}

const DURACION_NOTIFICACION_MS = 7000;

// ─── Helpers WebAuthn ──────────────────────────────────────────────────────────
// Convierte un ArrayBuffer a base64url para enviarlo al servidor.
function bufToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Convierte base64url → Uint8Array para pasarlo a WebAuthn.
function base64ToBuf(b64: string): Uint8Array {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
// ──────────────────────────────────────────────────────────────────────────────

export default function PantallaPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rutInputRef = useRef<HTMLInputElement>(null);
  const idNotifRef = useRef(0);
  const ultimaNotifPorUsuarioRef = useRef<Map<number, number>>(new Map());
  const DEBOUNCE_MISMA_PERSONA_MS = 8000;
  const ultimoNoReconocidoRef = useRef(0);
  const DEBOUNCE_NO_RECONOCIDO_MS = 8000;

  const [modo, setModo] = useState<Modo>('espera');
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [rutManual, setRutManual] = useState('');
  const [cargando, setCargando] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [faceApiCargando, setFaceApiCargando] = useState(false);
  const [hora, setHora] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [ultimosAccesos, setUltimosAccesos] = useState<any[]>([]);
  // Estado del lector de huella
  const [huellaEspera, setHuellaEspera] = useState(false);
  const [huellaMensaje, setHuellaMensaje] = useState('');

  const mostrarNotificacion = useCallback((datos: Omit<Notificacion, 'id'>) => {
    const id = ++idNotifRef.current;
    setNotificaciones(prev => [...prev, { id, ...datos }]);
    setTimeout(() => {
      setNotificaciones(prev => prev.filter(n => n.id !== id));
    }, DURACION_NOTIFICACION_MS);
  }, []);

  // Refresco automático cada 6 horas
  const HORAS_ENTRE_REFRESCOS = 6;
  const inicioRef = useRef(Date.now());
  const estadoActualRef = useRef({ hayNotificaciones: notificaciones.length > 0, escaneando, cargando });
  estadoActualRef.current = { hayNotificaciones: notificaciones.length > 0, escaneando, cargando };

  useEffect(() => {
    const chequeo = setInterval(() => {
      const horasActivo = (Date.now() - inicioRef.current) / (1000 * 60 * 60);
      const { hayNotificaciones, escaneando: enEscaneo, cargando: enCarga } = estadoActualRef.current;
      if (horasActivo >= HORAS_ENTRE_REFRESCOS && !hayNotificaciones && !enEscaneo && !enCarga) {
        window.location.reload();
      }
    }, 60000);
    return () => clearInterval(chequeo);
  }, []);

  // Reloj
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const cargarAccesos = useCallback(async () => {
    const res = await fetch('/api/asistencia?limit=8');
    const data = await res.json();
    setUltimosAccesos(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { cargarAccesos(); }, [cargarAccesos]);

  useEffect(() => {
    const reenfocar = () => {
      if (modo !== 'manual') return;
      const activo = document.activeElement;
      if (!activo || activo === document.body) rutInputRef.current?.focus();
    };
    reenfocar();
    const id = setInterval(reenfocar, 2000);
    return () => clearInterval(id);
  }, [modo]);

  useEffect(() => {
    const id = setInterval(cargarAccesos, 10000);
    return () => clearInterval(id);
  }, [cargarAccesos]);

  // ─── face-api ────────────────────────────────────────────────────────────────
  const cargarFaceApi = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setFaceApiCargando(true);
    // @ts-ignore
    if (window.faceapi) { setFaceApiReady(true); setFaceApiCargando(false); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    script.onload = async () => {
      try {
        // @ts-ignore
        const fa = window.faceapi;
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setFaceApiReady(true);
      } catch { setFaceApiReady(false); }
      setFaceApiCargando(false);
    };
    script.onerror = () => { setFaceApiCargando(false); };
    document.head.appendChild(script);
  }, []);

  const [jsQrListo, setJsQrListo] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // @ts-ignore
    if (window.jsQR) { setJsQrListo(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    script.onload = () => setJsQrListo(true);
    document.head.appendChild(script);
  }, []);

  // ─── Cámara ───────────────────────────────────────────────────────────────────
  const iniciarCamara = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      mostrarNotificacion({ tipo: 'error', mensaje: 'No se pudo acceder a la cámara' });
    }
  }, [mostrarNotificacion]);

  const detenerCamara = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // ─── Sonido ───────────────────────────────────────────────────────────────────
  const reproducirTono = (ctx: AudioContext, frecuencia: number, duracionMs: number, retrasoMs = 0) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const inicio = ctx.currentTime + retrasoMs / 1000;
    const fin = inicio + duracionMs / 1000;
    gain.gain.setValueAtTime(0, inicio);
    gain.gain.linearRampToValueAtTime(0.25, inicio + 0.01);
    gain.gain.linearRampToValueAtTime(0, fin);
    osc.start(inicio);
    osc.stop(fin + 0.02);
  };

  const reproducirSonido = useCallback((tipo: 'exito' | 'aviso' | 'error') => {
    try {
      // @ts-ignore
      const AudioContextClase = window.AudioContext || window.webkitAudioContext;
      const ctx: AudioContext = new AudioContextClase();
      if (tipo === 'exito') {
        reproducirTono(ctx, 880, 120, 0);
        reproducirTono(ctx, 1175, 160, 130);
      } else if (tipo === 'aviso') {
        reproducirTono(ctx, 520, 220, 0);
      } else {
        reproducirTono(ctx, 260, 150, 0);
        reproducirTono(ctx, 220, 200, 160);
      }
      setTimeout(() => ctx.close(), 700);
    } catch {}
  }, []);

  const emitirNotificacionIngreso = useCallback((data: any) => {
    mostrarNotificacion({
      tipo: data.duplicado ? 'duplicado' : data.planVigente ? 'bienvenido' : 'vencido',
      usuario: data.usuario,
      mensaje: data.mensaje,
      planVigente: data.planVigente,
    });
    if (!data.duplicado) {
      cargarAccesos();
      reproducirSonido(data.planVigente ? 'exito' : 'aviso');
    }
  }, [cargarAccesos, reproducirSonido, mostrarNotificacion]);

  const notificarIngresoEscaneo = useCallback((data: any) => {
    if (!data.usuario) return;
    const uid = data.usuario.id;
    const ahora = Date.now();
    const ultimaVez = ultimaNotifPorUsuarioRef.current.get(uid) || 0;
    if (ahora - ultimaVez < DEBOUNCE_MISMA_PERSONA_MS) return;
    ultimaNotifPorUsuarioRef.current.set(uid, ahora);
    emitirNotificacionIngreso(data);
  }, [emitirNotificacionIngreso]);

  // ─── Modo facial ──────────────────────────────────────────────────────────────
  const activarFacial = useCallback(async () => {
    setModo('facial');
    await iniciarCamara();
    if (!faceApiReady) await cargarFaceApi();
  }, [iniciarCamara, cargarFaceApi, faceApiReady]);

  const escaneandoRef = useRef(false);

  const escanearFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (escaneandoRef.current) return;
    // @ts-ignore
    if (!window.faceapi || !faceApiReady) return;

    escaneandoRef.current = true;
    setEscaneando(true);
    try {
      const ctx = canvasRef.current.getContext('2d')!;
      const anchoVideo = videoRef.current.videoWidth || 640;
      canvasRef.current.width = anchoVideo;
      canvasRef.current.height = videoRef.current.videoHeight || 480;
      ctx.drawImage(videoRef.current, 0, 0);

      const imgData = canvasRef.current.toDataURL('image/jpeg', 0.7);
      if (!imgRef.current) imgRef.current = new Image();
      const img = imgRef.current;
      await new Promise<void>(resolve => { img.onload = () => resolve(); img.src = imgData; });

      // @ts-ignore
      const opciones = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
      // @ts-ignore
      const detection = await window.faceapi
        .detectSingleFace(img, opciones)
        .withFaceLandmarks()
        .withFaceDescriptor();

      const hayRostroClaro = !!detection && detection.detection.box.width >= anchoVideo * 0.16;
      let resuelto = false;
      let qrIntentadoSinExito = false;

      if (hayRostroClaro) {
        const descriptor = Array.from(detection.descriptor);
        const res = await fetch('/api/asistencia/facial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptor }),
        });
        const data = await res.json();
        if (data.encontrado) {
          notificarIngresoEscaneo(data);
          resuelto = true;
        }
      }

      // @ts-ignore
      if (!resuelto && jsQrListo && window.jsQR) {
        try {
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          // @ts-ignore
          const codigo = window.jsQR(imageData.data, imageData.width, imageData.height);
          if (codigo?.data?.startsWith('CLUBFIT|')) {
            qrIntentadoSinExito = true;
            const rutQr = codigo.data.split('|')[1] || '';
            if (validarRut(rutQr)) {
              const resU = await fetch(`/api/usuarios?rut=${encodeURIComponent(rutQr)}`);
              const usuarioQr = await resU.json();
              if (usuarioQr && usuarioQr.id) {
                const asRes = await fetch('/api/asistencia', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ usuarioId: usuarioQr.id, metodo: 'qr' }),
                });
                const asData = await asRes.json();
                notificarIngresoEscaneo({ ...asData, usuario: asData.usuario || usuarioQr });
                resuelto = true;
              }
            }
          }
        } catch {}
      }

      if (!resuelto && (hayRostroClaro || qrIntentadoSinExito)) {
        const ahora = Date.now();
        if (ahora - ultimoNoReconocidoRef.current >= DEBOUNCE_NO_RECONOCIDO_MS) {
          ultimoNoReconocidoRef.current = ahora;
          mostrarNotificacion({ tipo: 'no_encontrado', mensaje: 'No se pudo identificar — prueba con tu huella o RUT' });
          reproducirSonido('error');
        }
      }
    } catch {}
    escaneandoRef.current = false;
    setEscaneando(false);
  }, [faceApiReady, jsQrListo, reproducirSonido, mostrarNotificacion, notificarIngresoEscaneo]);

  useEffect(() => {
    if (modo === 'facial' && faceApiReady) {
      intervalRef.current = setInterval(escanearFrame, 1500);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [modo, faceApiReady, escanearFrame]);

  useEffect(() => {
    if (modo !== 'facial') detenerCamara();
  }, [modo, detenerCamara]);

  useEffect(() => {
    return () => detenerCamara();
  }, [detenerCamara]);

  // ─── Modo huella (WA28 via WebAuthn) ─────────────────────────────────────────
  const leerHuella = useCallback(async () => {
    setHuellaEspera(true);
    setHuellaMensaje('Pon tu dedo en el lector...');

    try {
      // 1. Obtener la lista de credenciales registradas en el servidor
      const resReg = await fetch('/api/huella/verificar');
      const socios = await resReg.json();

      if (!Array.isArray(socios) || socios.length === 0) {
        setHuellaMensaje('⚠️ No hay socios con huella registrada');
        setHuellaEspera(false);
        return;
      }

      // 2. Armar allowCredentials con todos los IDs conocidos
      const allowCredentials: PublicKeyCredentialDescriptor[] = socios.map((s: any) => ({
        type: 'public-key',
        id: base64ToBuf(s.huella_id),
        // Transports que usa el WA28: USB HID → 'usb'; también 'internal' para
        // TPM/Windows Hello por si el PC lo ofrece como fallback.
        transports: ['usb', 'internal'] as AuthenticatorTransport[],
      }));

      // 3. Challenge aleatorio (el servidor podría generarlo; para la pantalla
      //    de acceso un nonce aleatorio en cliente es suficiente porque la
      //    verificación real que importa es el match del credentialId en BD).
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      // 4. Llamada WebAuthn — el WA28 muestra su LED, el usuario pone el dedo
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials,
          timeout: 30000,
          userVerification: 'preferred', // WA28 puede o no verificar PIN
          rpId: window.location.hostname,
        },
      }) as PublicKeyCredential | null;

      if (!credential) {
        setHuellaMensaje('No se recibió respuesta del lector');
        setHuellaEspera(false);
        return;
      }

      // 5. Enviar el credentialId al servidor para buscar el socio y marcar asistencia
      const credentialId = bufToBase64(credential.rawId);
      setHuellaMensaje('Verificando identidad...');

      const res = await fetch('/api/huella/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId }),
      });

      if (res.status === 404) {
        setHuellaMensaje('Huella no registrada en el sistema');
        reproducirSonido('error');
        mostrarNotificacion({ tipo: 'no_encontrado', mensaje: 'Huella no registrada — usa RUT o cámara' });
        setHuellaEspera(false);
        return;
      }

      const data = await res.json();
      emitirNotificacionIngreso(data);
      setHuellaMensaje('✓ Listo — pon el siguiente dedo cuando quieras');
    } catch (err: any) {
      // El usuario canceló o el lector no respondió a tiempo
      if (err?.name === 'NotAllowedError') {
        setHuellaMensaje('Lectura cancelada o tiempo agotado');
      } else if (err?.name === 'InvalidStateError') {
        setHuellaMensaje('⚠️ El lector no está disponible — revisa la conexión USB');
      } else {
        setHuellaMensaje('Error al leer la huella');
      }
      reproducirSonido('error');
    }

    setHuellaEspera(false);
  }, [emitirNotificacionIngreso, mostrarNotificacion, reproducirSonido]);

  // Cuando entra al modo huella, lanza la lectura automáticamente
  useEffect(() => {
    if (modo === 'huella' && !huellaEspera) {
      leerHuella();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo]);

  // ─── Registro manual por RUT ──────────────────────────────────────────────────
  const registrarManual = async () => {
    const rut = rutManual.trim();
    if (!rut) return;

    if (!validarRut(rut)) {
      mostrarNotificacion({ tipo: 'no_encontrado', mensaje: 'RUT inválido — revisa los números' });
      reproducirSonido('error');
      setRutManual('');
      rutInputRef.current?.focus();
      return;
    }

    setCargando(true);
    try {
      const res = await fetch(`/api/usuarios?rut=${encodeURIComponent(rut)}`);
      const usuario = await res.json();

      if (!usuario || !usuario.id) {
        mostrarNotificacion({ tipo: 'no_encontrado', mensaje: 'Usuario no encontrado con ese RUT' });
        reproducirSonido('error');
        setRutManual('');
        setCargando(false);
        rutInputRef.current?.focus();
        return;
      }

      const asRes = await fetch('/api/asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: usuario.id, metodo: 'manual' }),
      });
      const asData = await asRes.json();
      emitirNotificacionIngreso({ ...asData, usuario: asData.usuario || usuario });
      setRutManual('');
    } catch {
      mostrarNotificacion({ tipo: 'error', mensaje: 'Error de conexión' });
      reproducirSonido('error');
      setRutManual('');
    }
    setCargando(false);
    rutInputRef.current?.focus();
  };

  // ─── Estilos de notificación ──────────────────────────────────────────────────
  const coloresResultado: Record<string, { bg: string; border: string; texto: string }> = {
    bienvenido: { bg: 'rgba(0,224,150,0.1)', border: '#00e096', texto: '#00e096' },
    vencido: { bg: 'rgba(255,170,0,0.1)', border: '#ffaa00', texto: '#ffaa00' },
    duplicado: { bg: 'rgba(255,255,255,0.06)', border: '#888', texto: '#ffffff' },
    no_encontrado: { bg: 'rgba(255,61,113,0.1)', border: '#ff3d71', texto: '#ff3d71' },
    error: { bg: 'rgba(255,61,113,0.1)', border: '#ff3d71', texto: '#ff3d71' },
  };

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

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        background: '#141414', borderBottom: '1px solid #1e1e1e',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{
            fontSize: '2rem', fontWeight: 900, color: '#e50914',
            letterSpacing: '-1px', textTransform: 'uppercase',
          }}>CLUBFIT</span>
          <div style={{ borderLeft: '1px solid #2a2a2a', paddingLeft: '1.5rem' }}>
            <div style={{ color: '#ffffff', fontSize: '0.9rem' }}>
              {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{
            fontFamily: 'monospace', fontSize: '2rem', fontWeight: 700,
            color: '#e50914', letterSpacing: '2px',
          }}>{hora}</span>
          <Link href="/admin" style={{
            background: '#1e1e1e', color: '#888', border: '1px solid #2a2a2a',
            borderRadius: '8px', padding: '0.4rem 1rem', textDecoration: 'none',
            fontSize: '0.8rem',
          }}>⚙ Admin</Link>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Panel central */}
        <main style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Notificaciones de ingreso */}
          {notificaciones.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {notificaciones.map(n => {
                const estiloTipo = n.tipo === 'duplicado'
                  ? (n.planVigente ? 'bienvenido' : 'vencido')
                  : n.tipo;
                const estilo = coloresResultado[estiloTipo];
                return (
                  <div key={n.id} style={{
                    background: estilo.bg,
                    border: `2px solid ${estilo.border}`,
                    borderRadius: '16px', padding: '1.5rem 2rem',
                    animation: 'fadeIn 0.3s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                      {n.usuario?.foto && (
                        <img src={n.usuario.foto} alt=""
                          style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: `3px solid ${estilo.border}`, flexShrink: 0 }} />
                      )}
                      <div>
                        {n.usuario ? (
                          <>
                            <div style={{
                              fontSize: '2rem', fontWeight: 900, lineHeight: 1.15,
                              color: estilo.texto,
                            }}>
                              ¡Bienvenid@, {n.usuario.nombre}!
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginTop: '0.2rem' }}>
                              {n.planVigente ? 'a romper tus límites 💪' : '⚠️ tu plan está vencido'}
                            </div>
                            <div style={{
                              marginTop: '0.7rem', fontSize: '1.7rem', fontWeight: 800,
                              color: colorDias(diasParaVencer(n.usuario.plan_vencimiento)),
                            }}>
                              {textoDias(diasParaVencer(n.usuario.plan_vencimiento))}
                            </div>
                            <div style={{ color: '#888', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                              {n.usuario.rut} — Plan: {planLabel(n.usuario.plan_tipo)}
                              {' '}— Vence: {formatDate(n.usuario.plan_vencimiento)}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: estilo.texto }}>
                            {n.mensaje}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Grid de modos ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flex: 1, alignItems: 'start' }}>

            {/* ── Modo Huella WA28 ── */}
            <div style={{
              background: '#141414',
              border: `2px solid ${modo === 'huella' ? '#e50914' : '#1e1e1e'}`,
              borderRadius: '16px', padding: '1.5rem',
              display: 'flex', flexDirection: 'column', minHeight: '280px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: '#e50914', fontSize: '1.1rem', fontWeight: 700 }}>
                  🖐 Huella Digital (WA28)
                </h2>
                {modo === 'huella' && (
                  <button onClick={() => { setModo('espera'); setHuellaEspera(false); setHuellaMensaje(''); }} style={{
                    background: 'none', border: '1px solid #2a2a2a', color: '#888',
                    borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}>✕ Salir</button>
                )}
              </div>

              {modo !== 'huella' ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '4rem' }}>🖐</div>
                  <p style={{ color: '#888', textAlign: 'center', fontSize: '0.9rem', maxWidth: '260px' }}>
                    Identifica socios con el lector WA28 conectado por USB
                  </p>
                  <button
                    onClick={() => setModo('huella')}
                    style={{
                      background: '#e50914', color: '#ffffff', border: 'none',
                      borderRadius: '10px', padding: '0.75rem 2rem', cursor: 'pointer',
                      fontWeight: 700, fontSize: '1rem',
                    }}
                  >
                    Activar Lector
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
                  {/* Ícono animado del lector */}
                  <div style={{
                    fontSize: '5rem',
                    animation: huellaEspera ? 'pulse-huella 1.2s ease-in-out infinite' : 'none',
                  }}>🖐</div>

                  <p style={{
                    color: huellaEspera ? '#e50914' : '#888',
                    fontSize: '1rem', fontWeight: huellaEspera ? 700 : 400,
                    textAlign: 'center', maxWidth: '260px',
                  }}>
                    {huellaEspera ? huellaMensaje : (huellaMensaje || 'Lector listo')}
                  </p>

                  {/* Botón para volver a intentar si no está esperando */}
                  {!huellaEspera && (
                    <button
                      onClick={leerHuella}
                      style={{
                        background: '#e50914', color: '#ffffff', border: 'none',
                        borderRadius: '10px', padding: '0.75rem 2rem', cursor: 'pointer',
                        fontWeight: 700, fontSize: '1rem',
                      }}
                    >
                      🖐 Leer huella
                    </button>
                  )}

                  <p style={{ color: '#444', fontSize: '0.8rem', textAlign: 'center' }}>
                    El lector pide el dedo automáticamente al activar
                  </p>
                </div>
              )}
            </div>

            {/* ── Modo Facial / QR ── */}
            <div style={{
              background: '#141414', border: `2px solid ${modo === 'facial' ? '#e50914' : '#1e1e1e'}`,
              borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column',
              alignSelf: 'stretch', minHeight: '280px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: '#e50914', fontSize: '1.1rem', fontWeight: 700 }}>
                  🤳 Reconocimiento Facial / QR
                </h2>
                {modo === 'facial' && (
                  <button onClick={() => setModo('espera')} style={{
                    background: 'none', border: '1px solid #2a2a2a', color: '#888',
                    borderRadius: '6px', padding: '0.3rem 0.75rem', cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}>✕ Detener</button>
                )}
              </div>

              {modo !== 'facial' ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                  <div style={{ fontSize: '4rem' }}>📷</div>
                  <p style={{ color: '#888', textAlign: 'center', fontSize: '0.9rem' }}>
                    Identifica socios por rostro o código QR
                  </p>
                  <button onClick={activarFacial} style={{
                    background: '#e50914', color: '#ffffff', border: 'none',
                    borderRadius: '10px', padding: '0.75rem 2rem', cursor: 'pointer',
                    fontWeight: 700, fontSize: '1rem',
                  }}>
                    Activar Cámara
                  </button>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', flex: 1 }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{
                      width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                      transform: 'scaleX(-1)',
                    }} />
                    <div style={{
                      position: 'absolute', inset: 0, pointerEvents: 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{
                        border: '2px solid rgba(229,9,20,0.5)',
                        borderRadius: '50%', width: '200px', height: '200px',
                        animation: escaneando ? 'pulse-accent 1s infinite' : 'none',
                      }} />
                    </div>
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                    {faceApiCargando ? (
                      <span style={{ color: '#ffaa00' }}>⏳ Cargando modelos de IA...</span>
                    ) : faceApiReady ? (
                      <span style={{ color: '#00e096' }}>
                        {escaneando ? '🔍 Escaneando...' : '✓ Esperando rostro...'}
                      </span>
                    ) : (
                      <span style={{ color: '#888' }}>⚠️ Modelos no disponibles</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Registro manual compacto ── */}
          <div style={{
            background: '#141414', border: '1px solid #1e1e1e',
            borderRadius: '12px', padding: '0.75rem',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <span style={{ color: '#888', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Ingreso por RUT
            </span>
            <input
              ref={rutInputRef}
              value={rutManual}
              onChange={e => setRutManual(formatearRut(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && registrarManual()}
              placeholder="12.345.678-9"
              style={{
                flex: 1, minWidth: 0, background: '#1e1e1e', border: '1px solid #2a2a2a',
                borderRadius: '6px', padding: '0.4rem 0.5rem', color: '#ffffff',
                fontSize: '0.85rem', outline: 'none', textAlign: 'center',
                fontFamily: 'monospace', letterSpacing: '0.5px',
              }}
            />
            <button
              onClick={registrarManual}
              disabled={cargando || !rutManual}
              style={{
                background: rutManual ? '#e50914' : '#1e1e1e',
                color: rutManual ? '#ffffff' : '#888',
                border: 'none', borderRadius: '6px',
                padding: '0.4rem 0.75rem', cursor: rutManual ? 'pointer' : 'not-allowed',
                fontWeight: 700, fontSize: '0.85rem', opacity: cargando ? 0.7 : 1,
              }}
            >
              {cargando ? '⏳' : 'Registrar →'}
            </button>
          </div>
        </main>

        {/* Panel lateral — últimos accesos */}
        <aside style={{
          width: '280px', background: '#0d0d0d', borderLeft: '1px solid #1e1e1e',
          padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
          overflowY: 'auto',
        }}>
          <h3 style={{ color: '#888', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Últimos Accesos
          </h3>
          {ultimosAccesos.length === 0 ? (
            <p style={{ color: '#444', fontSize: '0.85rem' }}>Sin registros aún</p>
          ) : (
            ultimosAccesos.map(a => (
              <div key={a.id} style={{
                background: '#141414', borderRadius: '10px', padding: '0.75rem',
                border: `1px solid ${a.exitoso ? '#1a2a1a' : '#2a1a1a'}`,
              }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem' }}>
                  {a.nombre}
                </div>
                <div style={{ color: '#888', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                  <span>
                    {a.metodo === 'facial' ? '🤳' : a.metodo === 'huella' ? '🖐' : '✍️'} {a.metodo}
                  </span>
                  <span>{new Date(a.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))
          )}
        </aside>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-accent {
          0%, 100% { box-shadow: 0 0 0 0 rgba(229, 9, 20, 0.4); }
          50% { box-shadow: 0 0 0 15px rgba(229, 9, 20, 0); }
        }
        @keyframes pulse-huella {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.12); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
