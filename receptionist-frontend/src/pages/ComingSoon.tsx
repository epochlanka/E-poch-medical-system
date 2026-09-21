import { useLocation } from 'react-router-dom';
import { findNavLabel } from '../components/layout/navConfig';

const ComingSoon = () => {
  const location = useLocation();
  const label = findNavLabel(location.pathname);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        color: '#64748b',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: '#eaf1fe',
          color: '#2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
          fontSize: 28,
        }}
      >
        🚧
      </div>
      <h2 style={{ color: '#0f172a', marginBottom: 6 }}>{label}</h2>
      <p style={{ maxWidth: 380 }}>This screen hasn't been built yet in the receptionist portal.</p>
    </div>
  );
};

export default ComingSoon;
