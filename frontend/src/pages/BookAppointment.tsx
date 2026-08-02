import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import NewPatientModal from './dashboard/NewPatientModal';

const BookAppointment: React.FC = () => {
  const [patientId, setPatientId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  
  // Patient Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatientName, setSelectedPatientName] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Doctor Autocomplete state
  const [doctorSearchQuery, setDoctorSearchQuery] = useState('');
  const [selectedDoctorName, setSelectedDoctorName] = useState('');
  const [doctorSearchResults, setDoctorSearchResults] = useState<any[]>([]);
  const [isDoctorDropdownOpen, setIsDoctorDropdownOpen] = useState(false);
  const doctorDropdownRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (doctorDropdownRef.current && !doctorDropdownRef.current.contains(event.target as Node)) {
        setIsDoctorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced Search for Patient
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setIsDropdownOpen(false);
      return;
    }
    if (searchQuery === selectedPatientName) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const token = localStorage.getItem('epoch_token');
        const res = await axios.get(`http://localhost:3000/api/v1/patients?search=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSearchResults(res.data.data || []);
        setIsDropdownOpen(true);
      } catch (err) {
        console.error('Patient search failed', err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedPatientName]);

  // Debounced Search for Doctor
  useEffect(() => {
    if (!doctorSearchQuery) {
      setDoctorSearchResults([]);
      setIsDoctorDropdownOpen(false);
      return;
    }
    if (doctorSearchQuery === selectedDoctorName) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        const token = localStorage.getItem('epoch_token');
        const res = await axios.get(`http://localhost:3000/api/v1/appointments/doctors?search=${encodeURIComponent(doctorSearchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDoctorSearchResults(res.data.data || []);
        setIsDoctorDropdownOpen(true);
      } catch (err) {
        console.error('Doctor search failed', err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [doctorSearchQuery, selectedDoctorName]);

  const handleSelectPatient = (patient: any) => {
    setPatientId(patient.patient_id);
    setSelectedPatientName(patient.full_name);
    setSearchQuery(patient.full_name);
    setIsDropdownOpen(false);
  };

  const handleSelectDoctor = (doctor: any) => {
    setDoctorId(doctor.user_id.toString());
    const nameToDisplay = doctor.full_name || doctor.username;
    setSelectedDoctorName(nameToDisplay);
    setDoctorSearchQuery(nameToDisplay);
    setIsDoctorDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!patientId || !doctorId || !date || !time) {
      setError('Please fill in all fields and ensure a patient and doctor are selected.');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('epoch_token');
      const isoDate = new Date(`${date}T${time}`).toISOString();
      
      await axios.post('http://localhost:3000/api/v1/appointments', {
        patient_id: patientId,
        doctor_id: parseInt(doctorId, 10),
        scheduled_at: isoDate
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setMessage('Appointment successfully booked!');
      setPatientId('');
      setSearchQuery('');
      setSelectedPatientName('');
      setDoctorId('');
      setDoctorSearchQuery('');
      setSelectedDoctorName('');
      setDate('');
      setTime('');
    } catch (err: any) {
      if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else {
        setError('Failed to book appointment. Ensure patient and doctor exist.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Modern UI Styles
  const styles = {
    container: { display: 'flex', justifyContent: 'center', padding: '2rem 1rem' },
    card: { 
      background: '#ffffff', 
      borderRadius: '16px', 
      boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)', 
      padding: '24px', 
      width: '100%', 
      maxWidth: '400px', 
      border: '1px solid #f3f4f6'
    },
    title: { fontSize: '1.25rem', fontWeight: 600, color: '#111827', margin: '0 0 1.5rem 0' },
    label: { display: 'block', fontSize: '0.875rem', fontWeight: 500, color: '#374151', marginBottom: '0.35rem' },
    input: { 
      width: '100%', 
      padding: '0.625rem 0.75rem', 
      borderRadius: '8px', 
      border: '1px solid #d1d5db', 
      fontSize: '0.875rem', 
      boxSizing: 'border-box' as const,
      marginBottom: '1.25rem',
      outline: 'none',
      transition: 'border-color 0.2s ease'
    },
    button: { 
      width: '100%', 
      padding: '0.75rem', 
      borderRadius: '8px', 
      background: loading ? '#93c5fd' : '#2563eb', 
      color: '#ffffff', 
      fontWeight: 600, 
      border: 'none', 
      cursor: loading ? 'not-allowed' : 'pointer', 
      fontSize: '0.875rem',
      transition: 'background 0.2s ease'
    },
    quickActionBtn: { 
      background: 'none', 
      border: 'none', 
      color: '#2563eb', 
      cursor: 'pointer', 
      fontSize: '0.8rem', 
      fontWeight: 600, 
      padding: 0 
    },
    alert: { 
      padding: '0.75rem 1rem', 
      borderRadius: '8px', 
      fontSize: '0.875rem', 
      marginBottom: '1.25rem',
      fontWeight: 500 
    },
    row: { display: 'flex', gap: '1rem', marginBottom: '1.25rem' },
    dropdown: {
      position: 'absolute' as const,
      top: '100%',
      left: 0,
      right: 0,
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      marginTop: '4px',
      zIndex: 50,
      maxHeight: '200px',
      overflowY: 'auto' as const,
    },
    dropdownItem: {
      padding: '0.75rem 1rem',
      borderBottom: '1px solid #f3f4f6',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column' as const,
    },
    emptyState: {
      padding: '1rem',
      textAlign: 'center' as const,
      color: '#6b7280',
      fontSize: '0.875rem',
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Book Appointment</h2>
        
        {message && (
          <div style={{ ...styles.alert, background: '#dcfce7', color: '#166534' }}>
            {message}
          </div>
        )}
        {error && (
          <div style={{ ...styles.alert, background: '#fee2e2', color: '#991b1b' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Patient Autocomplete */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.35rem' }}>
              <label style={{ ...styles.label, marginBottom: 0 }}>Search Patient</label>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(true)}
                style={styles.quickActionBtn}
              >
                + Quick Register
              </button>
            </div>
            <input 
              type="text" 
              style={{...styles.input, marginBottom: '1rem'}} 
              placeholder="Search by name, ID, phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value !== selectedPatientName) {
                  setPatientId('');
                }
              }}
              onFocus={() => {
                if (searchResults.length > 0) setIsDropdownOpen(true);
              }}
              disabled={loading}
              autoComplete="off"
            />
            
            {isDropdownOpen && (
              <div style={styles.dropdown}>
                {searchResults.length > 0 ? (
                  searchResults.map(patient => (
                    <div 
                      key={patient.patient_id} 
                      style={styles.dropdownItem}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      onClick={() => handleSelectPatient(patient)}
                    >
                      <strong style={{ fontSize: '0.875rem', color: '#111827' }}>{patient.full_name}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        NIC: {patient.nic || 'N/A'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={styles.emptyState}>
                    <p style={{ margin: '0 0 0.5rem 0' }}>Patient does not exist.</p>
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsDropdownOpen(false);
                        setIsModalOpen(true);
                      }}
                      style={{ ...styles.quickActionBtn, fontSize: '0.875rem' }}
                    >
                      Quick Register?
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Doctor Autocomplete */}
          <div style={{ position: 'relative' }} ref={doctorDropdownRef}>
            <label style={styles.label}>Doctor</label>
            <input 
              type="text" 
              style={{...styles.input, marginBottom: '1rem'}} 
              placeholder="Search doctor by name..."
              value={doctorSearchQuery}
              onChange={(e) => {
                setDoctorSearchQuery(e.target.value);
                if (e.target.value !== selectedDoctorName) {
                  setDoctorId('');
                }
              }}
              onFocus={() => {
                if (doctorSearchResults.length > 0) setIsDoctorDropdownOpen(true);
                else {
                  // Fetch all doctors when focused and empty
                  const fetchDoctors = async () => {
                    const token = localStorage.getItem('epoch_token');
                    const res = await axios.get(`http://localhost:3000/api/v1/appointments/doctors`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    setDoctorSearchResults(res.data.data || []);
                    setIsDoctorDropdownOpen(true);
                  };
                  fetchDoctors();
                }
              }}
              disabled={loading}
              autoComplete="off"
            />
            
            {isDoctorDropdownOpen && (
              <div style={styles.dropdown}>
                {doctorSearchResults.length > 0 ? (
                  doctorSearchResults.map(doc => (
                    <div 
                      key={doc.user_id} 
                      style={styles.dropdownItem}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      onClick={() => handleSelectDoctor(doc)}
                    >
                      <strong style={{ fontSize: '0.875rem', color: '#111827' }}>Dr. {doc.full_name || doc.username}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        ID: {doc.user_id} | Reg: {doc.registration_number || 'N/A'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={styles.emptyState}>
                    <p style={{ margin: 0 }}>No doctor found.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Date</label>
              <input 
                type="date" 
                style={{...styles.input, marginBottom: 0}}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={loading}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>Time</label>
              <input 
                type="time" 
                style={{...styles.input, marginBottom: 0}}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          
          <button type="submit" style={styles.button} disabled={loading || !patientId || !doctorId}>
            {loading ? 'Booking...' : 'Book Appointment'}
          </button>
        </form>
      </div>
      
      {isModalOpen && (
        <NewPatientModal 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={(newId) => {
            const fetchNewPatient = async () => {
              try {
                const token = localStorage.getItem('epoch_token');
                const res = await axios.get(`http://localhost:3000/api/v1/patients/${newId}`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                setPatientId(res.data.patient_id);
                setSelectedPatientName(res.data.full_name);
                setSearchQuery(res.data.full_name);
              } catch (e) {
                setPatientId(newId);
                setSearchQuery(newId);
                setSelectedPatientName(newId);
              }
            };
            fetchNewPatient();
          }}
        />
      )}
    </div>
  );
};

export default BookAppointment;