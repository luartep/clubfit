'use client';
import { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  onCaptura: (foto: string, descriptor: number[] | null) => void;
  onCerrar: () => void;
}

export default function CamaraCaptura({ onCaptura, onCerrar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [capturada, setCapturada] = useState<string | null>(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [faceApi, setFaceApi] = useState<any>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState('');
  const [muestra, setMuestra] = useState(0); // progreso 0-3 mientras captura las 3 muestras
  // Si se cierra el modal (Cancelar / ✕) mientras las 3 muestras se siguen
  // analizando en segundo plano, esta ref evita que el resultado se aplique
  // igual al formulario del padre después de cancelar.
  const canceladoRef = useRef(false);

  // Cargar face-api.js desde CDN
  useEffect(() => {
    const loadFaceApi = async () => {
      if (typeof window === 'undefined') return;
      try {
        // @ts-ignore
        if (!window.faceapi) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
          script.onload = async () => {
            // @ts-ignore
            const fa = window.faceapi;
            setFaceApi(fa);
            try {
              const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
              // tinyFaceDetector es mucho más liviano y rápido que ssdMobilenetv1,
              // ideal para detectar una cara de frente y cerca de la cámara.
              await fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
              await fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
              await fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
              setModelsLoaded(true);
            } catch {
              setModelsLoaded(false);
            }
          };
          document.head.appendChild(script);
        } else {
          // @ts-ignore
          setFaceApi(window.faceapi);
          setModelsLoaded(true);
        }
      } catch {}
    };
    loadFaceApi();
  }, []);

  const iniciarCamara = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  }, []);

  // Bug corregido: antes esta limpieza capturaba el `stream` (estado) del
  // momento en que se creó el efecto — que siempre era `null`, porque
  // `iniciarCamara` es asíncrona y el estado se actualiza después. Como
  // resultado, la cámara NUNCA se apagaba al cerrar este modal (quedaba
  // prendida en segundo plano cada vez que se registraba o editaba una
  // foto). Usando una ref, la limpieza siempre ve el stream real y actual.
  useEffect(() => {
    iniciarCamara();
    return () => {
      canceladoRef.current = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [iniciarCamara]);

  const detectarDescriptor = useCallback(async (dataUrl: string) => {
    const img = new Image();
    img.src = dataUrl;
    await new Promise(r => { img.onload = r; });
    const opciones = new faceApi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
    const detection = await faceApi
      .detectSingleFace(img, opciones)
      .withFaceLandmarks()
      .withFaceDescriptor();
    return detection ? (Array.from(detection.descriptor) as number[]) : null;
  }, [faceApi]);

  const capturar = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth || 640;
    canvasRef.current.height = videoRef.current.videoHeight || 480;
    ctx.drawImage(videoRef.current, 0, 0);
    const foto = canvasRef.current.toDataURL('image/jpeg', 0.85);
    setCapturada(foto);

    if (!faceApi || !modelsLoaded) {
      if (!canceladoRef.current) onCaptura(foto, null);
      return;
    }

    // Se toman 3 muestras seguidas (con pequeñas pausas para que la persona
    // se mueva levemente) y se promedia el descriptor: esto hace el
    // reconocimiento mucho más tolerante a cambios de luz o ángulo que
    // guardar una sola foto.
    setCargandoIA(true);
    const descriptores: number[][] = [];
    try {
      for (let i = 0; i < 3; i++) {
        setMuestra(i + 1);
        if (i > 0) await new Promise(r => setTimeout(r, 450));
        ctx.drawImage(videoRef.current, 0, 0);
        const muestraDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
        try {
          const d = await detectarDescriptor(muestraDataUrl);
          if (d) descriptores.push(d);
        } catch {}
      }
    } finally {
      setCargandoIA(false);
      setMuestra(0);
    }

    if (descriptores.length === 0) {
      if (!canceladoRef.current) onCaptura(foto, null);
      return;
    }

    // Promedio componente a componente de todos los descriptores válidos
    const largo = descriptores[0].length;
    const promedio = new Array(largo).fill(0);
    for (const d of descriptores) {
      for (let i = 0; i < largo; i++) promedio[i] += d[i] / descriptores.length;
    }
    if (!canceladoRef.current) onCaptura(foto, promedio);
  }, [faceApi, modelsLoaded, onCaptura, detectarDescriptor]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#141414', borderRadius: '16px', padding: '2rem',
        border: '1px solid #2a2a2a', maxWidth: '700px', width: '100%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e50914', fontSize: '1.2rem', fontWeight: 700 }}>📸 Captura de Foto</h3>
          <button onClick={onCerrar} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.5rem' }}>✕</button>
        </div>

        {error ? (
          <p style={{ color: '#ff3d71', textAlign: 'center', padding: '2rem' }}>{error}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '2px solid #2a2a2a' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ display: 'block', maxWidth: '100%', maxHeight: '360px', transform: 'scaleX(-1)' }} />
              {/* Guía de encuadre */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                border: '2px dashed rgba(229,9,20,0.3)', borderRadius: '50%',
                margin: '15% 25%',
              }} />
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {!modelsLoaded && (
              <p style={{ color: '#ffaa00', fontSize: '0.85rem' }}>
                ⚠️ Modelos de IA no cargados — la foto se guardará sin descriptor facial
              </p>
            )}
            {modelsLoaded && !cargandoIA && (
              <p style={{ color: '#888', fontSize: '0.8rem', textAlign: 'center' }}>
                Ubica tu rostro dentro del círculo, con buena luz y mirando de frente
              </p>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={capturar} disabled={cargandoIA} style={{
                background: '#e50914', color: '#ffffff', border: 'none',
                borderRadius: '8px', padding: '0.75rem 2rem', fontWeight: 700,
                cursor: 'pointer', fontSize: '1rem',
                opacity: cargandoIA ? 0.6 : 1,
              }}>
                {cargandoIA ? `⏳ Analizando (${muestra}/3)...` : '📷 Capturar'}
              </button>
              <button onClick={onCerrar} style={{
                background: '#1e1e1e', color: '#ffffff', border: '1px solid #2a2a2a',
                borderRadius: '8px', padding: '0.75rem 2rem', fontWeight: 600,
                cursor: 'pointer', fontSize: '1rem',
              }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
