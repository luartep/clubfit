'use client';
import { useRef, useState, useCallback, useEffect } from 'react';

interface Props {
  onCaptura: (foto: string, descriptor: number[] | null) => void;
  onCerrar: () => void;
}

export default function CamaraCaptura({ onCaptura, onCerrar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturada, setCapturada] = useState<string | null>(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [faceApi, setFaceApi] = useState<any>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState('');

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
              await fa.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
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
      setStream(s);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      setError('No se pudo acceder a la cámara. Verifica los permisos.');
    }
  }, []);

  useEffect(() => {
    iniciarCamara();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const capturar = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    canvasRef.current.width = videoRef.current.videoWidth || 640;
    canvasRef.current.height = videoRef.current.videoHeight || 480;
    ctx.drawImage(videoRef.current, 0, 0);
    const foto = canvasRef.current.toDataURL('image/jpeg', 0.85);
    setCapturada(foto);

    // Extraer descriptor facial si face-api está disponible
    if (faceApi && modelsLoaded) {
      setCargandoIA(true);
      try {
        const img = new Image();
        img.src = foto;
        await new Promise(r => { img.onload = r; });
        const detection = await faceApi
          .detectSingleFace(img)
          .withFaceLandmarks()
          .withFaceDescriptor();
        const descriptor = detection ? (Array.from(detection.descriptor) as number[]) : null;
        setCargandoIA(false);
        onCaptura(foto, descriptor);
      } catch {
        setCargandoIA(false);
        onCaptura(foto, null);
      }
    } else {
      onCaptura(foto, null);
    }
  }, [faceApi, modelsLoaded, onCaptura]);

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
              <video ref={videoRef} autoPlay playsInline muted style={{ display: 'block', maxWidth: '100%', maxHeight: '360px' }} />
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

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={capturar} disabled={cargandoIA} style={{
                background: '#e50914', color: '#ffffff', border: 'none',
                borderRadius: '8px', padding: '0.75rem 2rem', fontWeight: 700,
                cursor: 'pointer', fontSize: '1rem',
                opacity: cargandoIA ? 0.6 : 1,
              }}>
                {cargandoIA ? '⏳ Procesando...' : '📷 Capturar'}
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
