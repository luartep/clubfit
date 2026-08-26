'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, clave }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Usuario o clave incorrectos');
      }
    } catch {
      setError('Error de conexión, intenta de nuevo');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#141414', border: '1px solid #2a2a2a', borderRadius: '14px',
        padding: '2.5rem', width: '100%', maxWidth: '360px',
      }}>
        <div style={{ fontSize: '1.7rem', fontWeight: 900, color: '#e50914', letterSpacing: '-1px', marginBottom: '0.2rem' }}>
          CLUBFIT
        </div>
        <p style={{ color: '#888', marginBottom: '1.8rem', fontSize: '0.9rem' }}>Panel de administración</p>

        <label style={{ display: 'block', color: '#ccc', fontSize: '0.85rem', marginBottom: '0.4rem' }}>Usuario</label>
        <input
          value={usuario}
          onChange={e => setUsuario(e.target.value)}
          autoFocus
          autoCapitalize="none"
          style={{
            width: '100%', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px',
            padding: '0.75rem 1rem', color: '#ffffff', marginBottom: '1rem', fontSize: '1rem',
            outline: 'none', boxSizing: 'border-box',
          }}
        />

        <label style={{ display: 'block', color: '#ccc', fontSize: '0.85rem', marginBottom: '0.4rem' }}>Clave</label>
        <input
          type="password"
          value={clave}
          onChange={e => setClave(e.target.value)}
          style={{
            width: '100%', background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: '8px',
            padding: '0.75rem 1rem', color: '#ffffff', marginBottom: '1.4rem', fontSize: '1rem',
            outline: 'none', boxSizing: 'border-box',
          }}
        />

        {error && (
          <p style={{ color: '#ff3d71', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>
        )}

        <button type="submit" disabled={enviando} style={{
          width: '100%', background: '#e50914', color: '#ffffff', border: 'none', borderRadius: '8px',
          padding: '0.85rem', fontWeight: 700, fontSize: '1rem',
          cursor: enviando ? 'default' : 'pointer', opacity: enviando ? 0.7 : 1,
        }}>
          {enviando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
