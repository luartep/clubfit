'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatearRut, validarRut, planLabel, formatDate, diasParaVencer } from '@/lib/utils';

type Modo = 'espera' | 'facial' | 'manual';
type ResultadoTipo = 'bienvenido' | 'vencido' | 'duplicado' | 'no_encontrado' | 'error';

interface Notificacion {
  id: number;
  tipo: ResultadoTipo;
  usuario?: any;
  mensaje?: string;
  planVigente?: boolean;
}

const DURACION_NOTIFICACION_MS = 7000;

export default function PantallaPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const imgRef = useRef<HTMLImageElement | null>(null); // se reutiliza en cada escaneo, en vez de crear una imagen nueva cada vez
  const rutInputRef = useRef<HTMLInputElement>(null); // se mantiene con foco para escribir o usar un lector de código de barras sin hacer clic primero
  const idNotifRef = useRef(0);
  // Evita mostrar una notificación nueva para LA MISMA persona si ya se le
  // mostró una hace pocos segundos (por ejemplo, si se queda parada frente a
  // la cámara y el escaneo la vuelve a detectar). No afecta a otras personas:
  // cada una se controla por su propio id.
  const ultimaNotifPorUsuarioRef = useRef<Map<number, number>>(new Map());
  const DEBOUNCE_MISMA_PERSONA_MS = 8000;

  const [modo, setModo] = useState<Modo>('espera');
  // Lista de notificaciones activas — puede haber varias al mismo tiempo si
  // dos personas distintas ingresan una detrás de la otra.
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [rutManual, setRutManual] = useState('');
  const [cargando, setCargando] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [faceApiCargando, setFaceApiCargando] = useState(false);
  const [hora, setHora] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [ultimosAccesos, setUltimosAccesos] = useState<any[]>([]);

  // Agrega una notificación a la lista y programa su propio auto-cierre a
  // los 7 segundos — cada una es independiente, así que varias pueden estar
  // en pantalla a la vez sin pisarse.
  const mostrarNotificacion = useCallback((datos: Omit<Notificacion, 'id'>) => {
    const id = ++idNotifRef.current;
    setNotificaciones(prev => [...prev, { id, ...datos }]);
    setTimeout(() => {
      setNotificaciones(prev => prev.filter(n => n.id !== id));
    }, DURACION_NOTIFICACION_MS);
  }, []);

  // Refresco automático cada 6 horas cuando la pantalla está inactiva
  // (sin notificaciones en pantalla ni un escaneo en curso). Esto es lo que
  // hacen los kioscos/pantallas de acceso 24/7 en la práctica: por más
  // optimizado que esté el código, un navegador con cámara + WebGL activos
  // durante horas se va poniendo lento (memoria, buffers de video, etc.) —
  // refrescar solos de vez en cuando resuelve eso de raíz sin cortar a
  // nadie a mitad de un ingreso.
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
    }, 60000); // revisa cada minuto si ya toca y si es un buen momento para no interrumpir a nadie
    return () => clearInterval(chequeo);
  }, []);

  // Reloj
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Cargar últimos accesos
  const cargarAccesos = useCallback(async () => {
    const res = await fetch('/api/asistencia?limit=8');
    const data = await res.json();
    setUltimosAccesos(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { cargarAccesos(); }, [cargarAccesos]);

  // Mantiene el foco en el campo de RUT para que el personal (o un lector de
  // código de barras/RUT) pueda escribir y presionar Enter sin hacer clic
  // primero. Se reaplica solo si el usuario no está usando otro campo (ej.
  // buscando algo distinto), para no robarle el foco a otra interacción.
  useEffect(() => {
    const reenfocar = () => {
      const activo = document.activeElement;
      if (!activo || activo === document.body) rutInputRef.current?.focus();
    };
    reenfocar();
    const id = setInterval(reenfocar, 2000);
    return () => clearInterval(id);
  }, []);

  // Actualización en vivo del listado lateral, por si el ingreso se registra
  // desde otro dispositivo (otra pantalla de acceso o el panel admin).
  useEffect(() => {
    const id = setInterval(cargarAccesos, 10000);
    return () => clearInterval(id);
  }, [cargarAccesos]);

  // Cargar face-api.js
  const cargarFaceApi = useCallback(async () => {
    if (typeof window === 'undefined') return;
    setFaceApiCargando(true);
    
    // @ts-ignore
    if (window.faceapi) {
      setFaceApiReady(true);
      setFaceApiCargando(false);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    script.onload = async () => {
      try {
        // @ts-ignore
        const fa = window.faceapi;
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
        // tinyFaceDetector: mismo tipo de descriptor facial, pero mucho más rápido
        // que ssdMobilenetv1 para detectar la cara en tiempo real en un kiosco.
        await Promise.all([
          fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setFaceApiReady(true);
      } catch {
        setFaceApiReady(false);
      }
      setFaceApiCargando(false);
    };
    script.onerror = () => { setFaceApiCargando(false); };
    document.head.appendChild(script);
  }, []);

  // Iniciar cámara
  const iniciarCamara = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
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

  // Sonido de confirmación con Web Audio API (sin archivos externos) —
  // le da al kiosco una señal auditiva clara de si el ingreso fue exitoso,
  // requiere atención (plan vencido / ya registrado) o fue rechazado.
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
      // @ts-ignore — Safari expone AudioContext como webkitAudioContext
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

  // Activar modo facial
  const activarFacial = useCallback(async () => {
    setModo('facial');
    await iniciarCamara();
    if (!faceApiReady) await cargarFaceApi();
  }, [iniciarCamara, cargarFaceApi, faceApiReady]);

  // Escanear frame y buscar rostro.
  // IMPORTANTE: escaneandoRef es una ref (no estado) a propósito. Antes,
  // pausar el escaneo tras un reconocimiento se hacía cancelando y
  // recreando el setInterval — pero como escanearFrame dependía de un
  // estado que cambiaba en cada ciclo, cada escaneo generaba una NUEVA
  // versión de la función, lo que disparaba el useEffect de más abajo y
  // creaba OTRO intervalo en paralelo sin cancelar el anterior. Con cada
  // persona reconocida quedaba un intervalo "huérfano" corriendo para
  // siempre. Usando una ref, escanearFrame ya no cambia de referencia y el
  // intervalo se crea una sola vez.
  //
  // Tampoco hay una pausa GLOBAL tras reconocer a alguien: si dos personas
  // entran seguidas, la segunda debe reconocerse igual sin esperar a que
  // termine el aviso de la primera. Lo único que se controla es no repetir
  // el aviso para LA MISMA persona si se le acaba de mostrar uno (ver
  // ultimaNotifPorUsuarioRef más arriba).
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

      // Si la cara está muy chica (persona lejos de la cámara), el descriptor
      // sale de mala calidad — se ignora en silencio y se sigue escaneando,
      // en vez de mandar un descriptor poco confiable al servidor.
      if (detection && detection.detection.box.width >= anchoVideo * 0.16) {
        const descriptor = Array.from(detection.descriptor);
        const res = await fetch('/api/asistencia/facial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ descriptor }),
        });
        const data = await res.json();

        if (data.encontrado) {
          const uid = data.usuario.id;
          const ahora = Date.now();
          const ultimaVez = ultimaNotifPorUsuarioRef.current.get(uid) || 0;
          // Evita repetir el aviso de la MISMA persona si se quedó parada
          // frente a la cámara — no afecta a otras personas.
          if (ahora - ultimaVez >= DEBOUNCE_MISMA_PERSONA_MS) {
            ultimaNotifPorUsuarioRef.current.set(uid, ahora);
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
          }
        }
      }
    } catch {}
    escaneandoRef.current = false;
    setEscaneando(false);
  }, [faceApiReady, cargarAccesos, reproducirSonido, mostrarNotificacion]);

  // Escaneo continuo — cada 1.5s, mucho más ágil que antes gracias al detector liviano.
  // Este efecto ahora solo depende de modo/faceApiReady (no de escanearFrame
  // cambiando en cada ciclo), así que el intervalo se crea una única vez.
  useEffect(() => {
    if (modo === 'facial' && faceApiReady) {
      intervalRef.current = setInterval(escanearFrame, 1500);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [modo, faceApiReady, escanearFrame]);

  // Limpiar al cambiar modo
  useEffect(() => {
    if (modo !== 'facial') detenerCamara();
  }, [modo, detenerCamara]);

  // Liberar la cámara también al desmontar la página (ej. si se navega a
  // otra sección estando en modo facial) — antes solo se liberaba al
  // cambiar de modo, nunca al salir de la página por completo.
  useEffect(() => {
    return () => detenerCamara();
  }, [detenerCamara]);

  // Registro manual por RUT
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

      mostrarNotificacion({
        tipo: asData.duplicado ? 'duplicado' : asData.planVigente ? 'bienvenido' : 'vencido',
        usuario: asData.usuario || usuario,
        mensaje: asData.mensaje,
        planVigente: asData.planVigente,
      });
      setRutManual('');
      if (!asData.duplicado) {
        cargarAccesos();
        reproducirSonido(asData.planVigente ? 'exito' : 'aviso');
      }
    } catch {
      mostrarNotificacion({ tipo: 'error', mensaje: 'Error de conexión' });
      reproducirSonido('error');
      setRutManual('');
    }
    setCargando(false);
    rutInputRef.current?.focus();
  };

  const coloresResultado: Record<string, { bg: string; border: string; texto: string }> = {
    bienvenido: { bg: 'rgba(0,224,150,0.1)', border: '#00e096', texto: '#00e096' },
    vencido: { bg: 'rgba(255,170,0,0.1)', border: '#ffaa00', texto: '#ffaa00' },
    duplicado: { bg: 'rgba(255,255,255,0.06)', border: '#888', texto: '#ffffff' },
    no_encontrado: { bg: 'rgba(255,61,113,0.1)', border: '#ff3d71', texto: '#ff3d71' },
    error: { bg: 'rgba(255,61,113,0.1)', border: '#ff3d71', texto: '#ff3d71' },
  };

  // Color de los días restantes del plan: verde con margen, amarillo cerca del
  // vencimiento (10 días o menos) y rojo cuando ya se cumplió (0 o vencido).
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
      minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column',
    }}>
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
          
          {/* Notificaciones de identificación — pueden mostrarse varias a la
              vez si dos personas distintas ingresan una detrás de la otra */}
          {notificaciones.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {notificaciones.map(n => {
                // El caso "duplicado" (ya marcó hace poco) se ve igual que un
                // ingreso normal — verde o ámbar según si el plan sigue
                // vigente — en vez de un color neutro aparte.
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
                            {/* Bienvenida grande y motivacional */}
                            <div style={{
                              fontSize: '2rem', fontWeight: 900, lineHeight: 1.15,
                              color: estilo.texto,
                            }}>
                              ¡Bienvenid@, {n.usuario.nombre}!
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', marginTop: '0.2rem' }}>
                              {n.planVigente ? 'a romper tus límites 💪' : '⚠️ tu plan está vencido'}
                            </div>

                            {/* Días restantes del plan, coloreados según cuánto queda — siempre visible */}
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
                          <div style={{
                            fontSize: '1.4rem', fontWeight: 800,
                            color: estilo.texto,
                          }}>
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

          {/* Modos de identificación */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 0.8fr', gap: '1.5rem', flex: 1, alignItems: 'start' }}>
            
            {/* Reconocimiento Facial */}
            <div style={{
              background: '#141414', border: `2px solid ${modo === 'facial' ? '#e50914' : '#1e1e1e'}`,
              borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column',
              alignSelf: 'stretch', minHeight: '420px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ color: '#e50914', fontSize: '1.1rem', fontWeight: 700 }}>
                  🤳 Reconocimiento Facial
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
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '1rem',
                }}>
                  <div style={{ fontSize: '4rem' }}>📷</div>
                  <p style={{ color: '#888', textAlign: 'center', fontSize: '0.9rem' }}>
                    Identifica a los socios automáticamente con su rostro
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
                    {/* Overlay de escaneo */}
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

            {/* Registro Manual — intencionalmente muy compacto: se usa poco,
                toda la prioridad visual es para el texto de bienvenida y el
                reconocimiento facial */}
            <div style={{
              background: '#141414', border: `2px solid ${modo === 'manual' ? '#e50914' : '#1e1e1e'}`,
              borderRadius: '12px', padding: '0.75rem', display: 'flex', flexDirection: 'column',
              alignSelf: 'start', gap: '0.5rem',
            }}>
              <h2 style={{ color: '#e50914', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Registro Manual (RUT)
              </h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  ref={rutInputRef}
                  value={rutManual}
                  onChange={e => setRutManual(formatearRut(e.target.value))}
                  onKeyDown={e => e.key === 'Enter' && registrarManual()}
                  placeholder="12.345.678-9"
                  style={{
                    flex: 1, minWidth: 0, background: '#1e1e1e', border: '1px solid #2a2a2a',
                    borderRadius: '6px', padding: '0.4rem 0.5rem', color: '#ffffff',
                    fontSize: '0.8rem', outline: 'none', textAlign: 'center',
                    fontFamily: 'monospace', letterSpacing: '0.5px', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={registrarManual}
                  disabled={cargando || !rutManual}
                  title="Registrar ingreso"
                  style={{
                    background: rutManual ? '#e50914' : '#1e1e1e',
                    color: rutManual ? '#ffffff' : '#888',
                    border: 'none', borderRadius: '6px',
                    padding: '0.4rem 0.7rem', cursor: rutManual ? 'pointer' : 'not-allowed',
                    fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                    opacity: cargando ? 0.7 : 1,
                  }}
                >
                  {cargando ? '⏳' : '→'}
                </button>
              </div>
            </div>
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
                  <span>{a.metodo === 'facial' ? '🤳' : '✍️'} {a.metodo}</span>
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
      `}</style>
    </div>
  );
}
