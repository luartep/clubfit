'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatearRut, validarRut, estadoPlan, planLabel, formatDate, diasParaVencer } from '@/lib/utils';

type Modo = 'espera' | 'facial' | 'manual';
type ResultadoTipo = 'bienvenido' | 'vencido' | 'duplicado' | 'no_encontrado' | 'error' | null;

interface Resultado {
  tipo: ResultadoTipo;
  usuario?: any;
  mensaje?: string;
  planVigente?: boolean;
}

export default function PantallaPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const imgRef = useRef<HTMLImageElement | null>(null); // se reutiliza en cada escaneo, en vez de crear una imagen nueva cada vez

  const [modo, setModo] = useState<Modo>('espera');
  const [resultado, setResultado] = useState<Resultado>({ tipo: null });
  const [rutManual, setRutManual] = useState('');
  const [cargando, setCargando] = useState(false);
  const [faceApiReady, setFaceApiReady] = useState(false);
  const [faceApiCargando, setFaceApiCargando] = useState(false);
  const [hora, setHora] = useState('');
  const [escaneando, setEscaneando] = useState(false);
  const [ultimosAccesos, setUltimosAccesos] = useState<any[]>([]);

  // Refresco automático cada 6 horas cuando la pantalla está inactiva
  // (sin resultado en pantalla ni un escaneo en curso). Esto es lo que hacen
  // los kioscos/pantallas de acceso 24/7 en la práctica: por más optimizado
  // que esté el código, un navegador con cámara + WebGL activos durante
  // horas se va poniendo lento (memoria, buffers de video, etc.) — refrescar
  // solos de vez en cuando resuelve eso de raíz sin cortar a nadie a mitad
  // de un ingreso.
  const HORAS_ENTRE_REFRESCOS = 6;
  const inicioRef = useRef(Date.now());
  const estadoActualRef = useRef({ resultadoTipo: resultado.tipo, escaneando, cargando });
  estadoActualRef.current = { resultadoTipo: resultado.tipo, escaneando, cargando };

  useEffect(() => {
    const chequeo = setInterval(() => {
      const horasActivo = (Date.now() - inicioRef.current) / (1000 * 60 * 60);
      const { resultadoTipo, escaneando: enEscaneo, cargando: enCarga } = estadoActualRef.current;
      if (horasActivo >= HORAS_ENTRE_REFRESCOS && !resultadoTipo && !enEscaneo && !enCarga) {
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

  // Auto-limpiar resultado después de 15 segundos
  useEffect(() => {
    if (resultado.tipo) {
      const t = setTimeout(() => {
        setResultado({ tipo: null });
        if (modo === 'facial') setModo('facial'); // mantiene cámara
      }, 15000);
      return () => clearTimeout(t);
    }
  }, [resultado]);

  // Cargar últimos accesos
  const cargarAccesos = useCallback(async () => {
    const res = await fetch('/api/asistencia?limit=8');
    const data = await res.json();
    setUltimosAccesos(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { cargarAccesos(); }, [cargarAccesos]);

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
      setResultado({ tipo: 'error', mensaje: 'No se pudo acceder a la cámara' });
    }
  }, []);

  const detenerCamara = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Activar modo facial
  const activarFacial = useCallback(async () => {
    setModo('facial');
    setResultado({ tipo: null });
    await iniciarCamara();
    if (!faceApiReady) await cargarFaceApi();
  }, [iniciarCamara, cargarFaceApi, faceApiReady]);

  // Escanear frame y buscar rostro.
  // IMPORTANTE: escaneandoRef/pausadoHastaRef son refs (no estado) a propósito.
  // Antes, el "pausar 15s tras un reconocimiento" se hacía cancelando y
  // recreando el setInterval — pero como escanearFrame dependía de `escaneando`
  // (estado), cada vez que terminaba un escaneo se generaba una NUEVA versión
  // de la función, lo que disparaba el useEffect de más abajo y creaba OTRO
  // intervalo en paralelo sin cancelar el anterior. Con cada persona
  // reconocida quedaba un intervalo "huérfano" corriendo para siempre — por
  // eso se iba pegando cada vez más rápido con cada ingreso. Usando refs para
  // el control interno, escanearFrame ya no cambia de referencia y el
  // intervalo se crea una sola vez.
  const escaneandoRef = useRef(false);
  const pausadoHastaRef = useRef(0);

  const escanearFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (escaneandoRef.current || Date.now() < pausadoHastaRef.current) return;
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
          setResultado({
            tipo: data.duplicado ? 'duplicado' : data.planVigente ? 'bienvenido' : 'vencido',
            usuario: data.usuario,
            mensaje: data.mensaje,
            planVigente: data.planVigente,
          });
          if (!data.duplicado) cargarAccesos();
          // Pausa simple sin tocar el intervalo: los próximos ticks se
          // ignoran solos hasta que pase el tiempo, sin crear intervalos nuevos.
          pausadoHastaRef.current = Date.now() + 15000;
        }
      }
    } catch {}
    escaneandoRef.current = false;
    setEscaneando(false);
  }, [faceApiReady, cargarAccesos]);

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

  // Registro manual por RUT
  const registrarManual = async () => {
    const rut = rutManual.trim();
    if (!rut) return;

    setCargando(true);
    try {
      const res = await fetch(`/api/usuarios?rut=${encodeURIComponent(rut)}`);
      const usuario = await res.json();

      if (!usuario || !usuario.id) {
        setResultado({ tipo: 'no_encontrado', mensaje: 'Usuario no encontrado con ese RUT' });
        setCargando(false);
        return;
      }

      const asRes = await fetch('/api/asistencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuarioId: usuario.id, metodo: 'manual' }),
      });
      const asData = await asRes.json();

      setResultado({
        tipo: asData.duplicado ? 'duplicado' : asData.planVigente ? 'bienvenido' : 'vencido',
        usuario: asData.usuario || usuario,
        mensaje: asData.mensaje,
        planVigente: asData.planVigente,
      });
      setRutManual('');
      if (!asData.duplicado) cargarAccesos();
    } catch {
      setResultado({ tipo: 'error', mensaje: 'Error de conexión' });
    }
    setCargando(false);
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
          
          {/* Resultado de identificación */}
          {resultado.tipo && (() => {
            // El caso "duplicado" (ya marcó hace poco) se ve igual que un ingreso
            // normal — verde o ámbar según si el plan sigue vigente — en vez de un
            // color neutro aparte.
            const estiloTipo = resultado.tipo === 'duplicado'
              ? (resultado.planVigente ? 'bienvenido' : 'vencido')
              : resultado.tipo;
            const estilo = coloresResultado[estiloTipo];
            return (
            <div style={{
              background: estilo.bg,
              border: `2px solid ${estilo.border}`,
              borderRadius: '16px', padding: '2rem 2.5rem',
              animation: 'fadeIn 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                {resultado.usuario?.foto && (
                  <img src={resultado.usuario.foto} alt=""
                    style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: `3px solid ${estilo.border}`, flexShrink: 0 }} />
                )}
                <div>
                  {resultado.usuario ? (
                    <>
                      {/* Bienvenida grande y motivacional */}
                      <div style={{
                        fontSize: '2.5rem', fontWeight: 900, lineHeight: 1.15,
                        color: estilo.texto,
                      }}>
                        ¡Bienvenid@, {resultado.usuario.nombre}!
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 600, color: '#ffffff', marginTop: '0.2rem' }}>
                        {resultado.planVigente ? 'a romper tus límites 💪' : '⚠️ tu plan está vencido'}
                      </div>

                      {/* Días restantes del plan, coloreados según cuánto queda — siempre visible */}
                      <div style={{
                        marginTop: '0.9rem', fontSize: '2.2rem', fontWeight: 800,
                        color: colorDias(diasParaVencer(resultado.usuario.plan_vencimiento)),
                      }}>
                        {textoDias(diasParaVencer(resultado.usuario.plan_vencimiento))}
                      </div>

                      <div style={{ color: '#888', marginTop: '0.6rem', fontSize: '0.9rem' }}>
                        {resultado.usuario.rut} — Plan: {planLabel(resultado.usuario.plan_tipo)}
                        {' '}— Vence: {formatDate(resultado.usuario.plan_vencimiento)}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      fontSize: '1.6rem', fontWeight: 800,
                      color: estilo.texto,
                    }}>
                      {resultado.mensaje}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })()}

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
