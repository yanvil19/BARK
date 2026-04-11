import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';

export default function AdminUsers() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const res = await apiAuth('/api/auth/users?limit=100');
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main>
      <h2>Super Admin: Users</h2>
      <button onClick={load} disabled={busy}>
        Refresh
      </button>
      {error ? <p>{error}</p> : null}
      {busy ? <p>Loading...</p> : null}
      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : null}
    </main>
  );
}

