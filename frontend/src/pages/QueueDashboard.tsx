import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Appointment {
  appointment_id: number;
  scheduled_at: string;
  status: string;
  patient: {
    full_name: string;
    gender: string;
  };
  doctor: {
    username: string;
  };
}

const formatTime = (isoString: string) => {
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const QueueDashboard: React.FC = () => {
  const [queue, setQueue] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingTimeId, setEditingTimeId] = useState<number | null>(null);
  const [editTimeValue, setEditTimeValue] = useState('');

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('epoch_token');
      const res = await axios.get('http://localhost:3000/api/v1/appointments/queue', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setQueue(res.data);
      setError('');
    } catch (err: any) {
      setError('Failed to fetch queue. Please log in.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 10000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (id: number, status: string) => {
    if (status === 'Skipped') {
      const confirmed = window.confirm('Are you sure you want to cancel this appointment?');
      if (!confirmed) return;
    }
    
    try {
      const token = localStorage.getItem('epoch_token');
      await axios.patch(`http://localhost:3000/api/v1/appointments/${id}/status`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchQueue();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const handleTimeEdit = (app: Appointment) => {
    setEditingTimeId(app.appointment_id);
    const d = new Date(app.scheduled_at);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    setEditTimeValue(timeStr);
  };

  const saveTimeEdit = async (app: Appointment) => {
    setEditingTimeId(null);
    if (!editTimeValue) return;

    try {
      const d = new Date(app.scheduled_at);
      const [hours, minutes] = editTimeValue.split(':').map(Number);
      d.setHours(hours, minutes, 0, 0);

      const token = localStorage.getItem('epoch_token');
      await axios.patch(`http://localhost:3000/api/v1/appointments/${app.appointment_id}/time`, 
        { scheduled_at: d.toISOString() }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchQueue();
    } catch (err) {
      alert('Failed to update time');
    }
  };

  const sortByTime = (a: Appointment, b: Appointment) => {
    return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
  };

  const waiting = queue.filter(a => a.status === 'Waiting').sort(sortByTime);
  const called = queue.filter(a => a.status === 'Called').sort(sortByTime);
  const consulting = queue.filter(a => a.status === 'Consulting').sort(sortByTime);

  // Modern UI Styles
  const styles = {
    container: { padding: '2rem 1.5rem', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' },
    title: { fontSize: '1.5rem', fontWeight: 600, color: '#111827', margin: 0 },
    refreshBtn: { 
      padding: '0.5rem 1rem', borderRadius: '8px', background: '#f3f4f6', color: '#374151', 
      border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
      transition: 'background 0.2s'
    },
    board: { display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' as const },
    column: { flex: 1, minWidth: '300px', background: '#f9fafb', borderRadius: '12px', border: '1px solid #f3f4f6', padding: '1.25rem' },
    columnHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
    columnTitle: { margin: 0, fontSize: '0.85rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    countBadge: { background: '#e5e7eb', color: '#4b5563', padding: '0.15rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600 },
    card: { 
      background: '#ffffff', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
      border: '1px solid #e5e7eb', padding: '1rem', marginBottom: '0.75rem', display: 'flex', 
      flexDirection: 'column' as const, gap: '0.875rem' 
    },
    cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
    patientName: { fontSize: '0.95rem', fontWeight: 600, color: '#111827', margin: 0 },
    doctorText: { fontSize: '0.8rem', color: '#6b7280', margin: '0.25rem 0 0 0' },
    timeBadge: { 
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#f3f4f6', 
      color: '#4b5563', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', 
      fontWeight: 500, cursor: 'pointer', border: '1px solid transparent' 
    },
    timeInput: { padding: '0.15rem 0.25rem', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #3b82f6', outline: 'none' },
    actions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6', paddingTop: '0.75rem' },
    btnBase: { padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer', border: 'none' },
    emptyState: { textAlign: 'center' as const, color: '#9ca3af', fontSize: '0.875rem', padding: '2rem 0' }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Live Consultation Queue</h2>
        <button style={styles.refreshBtn} onClick={fetchQueue} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Now'}
        </button>
      </div>
      
      {error && <div style={{ color: '#dc2626', background: '#fee2e2', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>{error}</div>}

      <div style={styles.board}>
        
        {/* Waiting Column */}
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <h3 style={styles.columnTitle}>Waiting</h3>
            <span style={styles.countBadge}>{waiting.length}</span>
          </div>
          
          <div>
            {waiting.map(app => (
              <div key={app.appointment_id} style={{ ...styles.card, borderLeft: '4px solid #e5e7eb' }}>
                <div style={styles.cardHeader}>
                  <div>
                    <h4 style={styles.patientName}>{app.patient.full_name}</h4>
                    <p style={styles.doctorText}>Dr. {app.doctor.username}</p>
                  </div>
                  
                  {editingTimeId === app.appointment_id ? (
                    <input 
                      type="time" 
                      value={editTimeValue}
                      onChange={(e) => setEditTimeValue(e.target.value)}
                      onBlur={() => saveTimeEdit(app)}
                      onKeyDown={(e) => e.key === 'Enter' && saveTimeEdit(app)}
                      autoFocus
                      style={styles.timeInput}
                    />
                  ) : (
                    <span 
                      style={styles.timeBadge}
                      onClick={() => handleTimeEdit(app)}
                      title="Click to edit time"
                    >
                      ⏱ {formatTime(app.scheduled_at)}
                    </span>
                  )}
                </div>
                
                <div style={styles.actions}>
                  <button 
                    style={{ ...styles.btnBase, background: 'transparent', color: '#ef4444', border: '1px solid #fee2e2' }} 
                    onClick={() => updateStatus(app.appointment_id, 'Skipped')}
                  >
                    Cancel
                  </button>
                  <button 
                    style={{ ...styles.btnBase, background: '#2563eb', color: 'white' }} 
                    onClick={() => updateStatus(app.appointment_id, 'Called')}
                  >
                    Call Patient
                  </button>
                </div>
              </div>
            ))}
            {waiting.length === 0 && <p style={styles.emptyState}>No patients waiting.</p>}
          </div>
        </div>

        {/* In Progress Column */}
        <div style={styles.column}>
          <div style={styles.columnHeader}>
            <h3 style={styles.columnTitle}>In Progress</h3>
            <span style={styles.countBadge}>{called.length + consulting.length}</span>
          </div>
          
          <div>
            {/* Called */}
            {called.map(app => (
              <div key={app.appointment_id} style={{ ...styles.card, borderLeft: '4px solid #f59e0b' }}>
                <div style={styles.cardHeader}>
                  <div>
                    <h4 style={styles.patientName}>{app.patient.full_name}</h4>
                    <p style={styles.doctorText}>Called by Dr. {app.doctor.username}</p>
                  </div>
                  <span style={{ ...styles.timeBadge, background: '#fef3c7', color: '#92400e' }}>
                    Called
                  </span>
                </div>
                
                <div style={styles.actions}>
                  <button 
                    style={{ ...styles.btnBase, background: 'transparent', color: '#4b5563', border: '1px solid #e5e7eb' }} 
                    onClick={() => updateStatus(app.appointment_id, 'Waiting')}
                  >
                    Undo
                  </button>
                  <button 
                    style={{ ...styles.btnBase, background: '#10b981', color: 'white' }} 
                    onClick={() => updateStatus(app.appointment_id, 'Consulting')}
                  >
                    Start Consultation
                  </button>
                </div>
              </div>
            ))}
            
            {/* Consulting */}
            {consulting.map(app => (
              <div key={app.appointment_id} style={{ ...styles.card, borderLeft: '4px solid #10b981' }}>
                <div style={styles.cardHeader}>
                  <div>
                    <h4 style={styles.patientName}>{app.patient.full_name}</h4>
                    <p style={{ ...styles.doctorText, color: '#059669', fontWeight: 500 }}>
                      Consulting with Dr. {app.doctor.username}
                    </p>
                  </div>
                  <span style={{ ...styles.timeBadge, background: '#d1fae5', color: '#065f46' }}>
                    Active
                  </span>
                </div>
                
                <div style={styles.actions}>
                  <button 
                    style={{ ...styles.btnBase, background: '#10b981', color: 'white', width: '100%' }} 
                    onClick={() => updateStatus(app.appointment_id, 'Completed')}
                  >
                    Finish Consultation
                  </button>
                </div>
              </div>
            ))}
            
            {called.length === 0 && consulting.length === 0 && <p style={styles.emptyState}>No active consultations.</p>}
          </div>
        </div>

      </div>
    </div>
  );
};

export default QueueDashboard;