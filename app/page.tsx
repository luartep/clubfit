import Link from 'next/link';

export default function Home() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '2rem',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '4rem',
          fontWeight: 900,
          color: '#00e5ff',
          letterSpacing: '-2px',
          textTransform: 'uppercase',
        }}>CLUBFIT</h1>
        <p style={{ color: '#888', marginTop: '0.5rem', fontSize: '1.1rem' }}>
          Sistema de Control de Asistencia
        </p>
      </div>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/admin" style={{
          background: '#00e5ff',
          color: '#0a0a0a',
          padding: '1rem 2rem',
          borderRadius: '8px',
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: '1rem',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          Panel Admin
        </Link>
        <Link href="/pantalla" style={{
          background: '#1e1e1e',
          color: '#00e5ff',
          padding: '1rem 2rem',
          borderRadius: '8px',
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: '1rem',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          border: '1px solid #2a2a2a',
        }}>
          Pantalla Acceso
        </Link>
      </div>
    </main>
  );
}
