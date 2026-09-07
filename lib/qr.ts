import QRCode from 'qrcode';

// Prefijo para distinguir los QR generados por ClubFit de cualquier otro QR
// que la cámara pudiera leer por casualidad (un producto, una URL, etc.).
export const PREFIJO_QR = 'CLUBFIT|';

export function contenidoQR(rut: string): string {
  return `${PREFIJO_QR}${rut}`;
}

// Genera una imagen PNG (como dataURL) con el código QR del socio, su
// nombre y su RUT — pensada para compartirse o descargarse tal cual y
// mostrarse en el ingreso del gimnasio si el reconocimiento facial falla.
export async function generarImagenQR(usuario: { nombre: string; rut: string }): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(contenidoQR(usuario.rut), {
    width: 400,
    margin: 1,
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });

  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 620;
  const ctx = canvas.getContext('2d')!;

  // Fondo blanco
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Encabezado de marca
  ctx.fillStyle = '#e50914';
  ctx.font = '900 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CLUBFIT', canvas.width / 2, 55);

  // Nombre y RUT del socio
  ctx.fillStyle = '#0a0a0a';
  ctx.font = 'bold 26px Arial, sans-serif';
  ajustarYDibujarTexto(ctx, usuario.nombre, canvas.width / 2, 100, canvas.width - 60);
  ctx.fillStyle = '#666666';
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText(usuario.rut, canvas.width / 2, 130);

  // Código QR centrado
  const qrImg = await cargarImagen(qrDataUrl);
  const qrTam = 380;
  ctx.drawImage(qrImg, (canvas.width - qrTam) / 2, 155, qrTam, qrTam);

  // Pie de página
  ctx.fillStyle = '#888888';
  ctx.font = '15px Arial, sans-serif';
  ctx.fillText('Muestra este código en el ingreso del gimnasio', canvas.width / 2, 565);
  ctx.fillStyle = '#bbbbbb';
  ctx.font = '13px Arial, sans-serif';
  ctx.fillText('Si prefieres, también puedes ingresar con tu RUT', canvas.width / 2, 588);

  return canvas.toDataURL('image/png');
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Recorta el nombre si es muy largo para que no se salga del ancho de la tarjeta
function ajustarYDibujarTexto(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, anchoMax: number) {
  let t = texto;
  while (ctx.measureText(t).width > anchoMax && t.length > 3) {
    t = t.slice(0, -1);
  }
  if (t !== texto) t = t.trimEnd() + '…';
  ctx.fillText(t, x, y);
}

export function dataUrlABlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Descarga directa de la imagen del QR — sin pasar por el selector de
// compartir del sistema, siempre guarda el archivo (funciona igual en
// computador y celular).
export async function descargarQR(usuario: { nombre: string; rut: string }): Promise<void> {
  const dataUrl = await generarImagenQR(usuario);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `qr-${usuario.rut.replace(/\./g, '')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Comparte la imagen del QR por WhatsApp (u otra app) usando el selector
// nativo del sistema si está disponible (celulares principalmente); si no,
// descarga el archivo para compartirlo manualmente.
export async function compartirQR(usuario: { nombre: string; rut: string }): Promise<'compartido' | 'descargado' | 'cancelado'> {
  const dataUrl = await generarImagenQR(usuario);
  const blob = dataUrlABlob(dataUrl);
  const archivo = new File([blob], `qr-${usuario.rut.replace(/\./g, '')}.png`, { type: 'image/png' });

  // @ts-ignore — canShare/share con archivos no está en todos los navegadores/TS lib
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      // @ts-ignore
      await navigator.share({
        files: [archivo],
        title: `Código de acceso — ${usuario.nombre}`,
        text: `Hola ${usuario.nombre}, este es tu código de acceso a ClubFit. Muéstralo en el ingreso si la cámara no te reconoce.`,
      });
      return 'compartido';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelado';
      // sigue al fallback de descarga si falló por otra razón
    }
  }

  await descargarQR(usuario);
  return 'descargado';
}
