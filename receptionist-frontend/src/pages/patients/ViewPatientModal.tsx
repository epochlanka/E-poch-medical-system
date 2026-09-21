import { useApiData } from '../../hooks/useApiData';
import { getPatient } from '../../lib/patients';
import { fileUrl } from '../../lib/api';
import { initials, calculateAge, formatDate } from './patientUtils';

interface ViewPatientModalProps {
  patientId: string;
  onClose: () => void;
  onEdit: () => void;
}

const ViewPatientModal = ({ patientId, onClose, onEdit }: ViewPatientModalProps) => {
  const { data: patient, loading, error } = useApiData(() => getPatient(patientId), [patientId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {loading && <p className="modal-subtitle">Loading patient…</p>}
        {error && <div className="modal-error">{error}</div>}

        {patient && (
          <>
            <div className="pat-view-header">
              {patient.photo_url ? (
                <img className="pat-view-avatar" src={fileUrl(patient.photo_url)} alt={patient.full_name} />
              ) : (
                <div className="pat-view-avatar">{initials(patient.full_name)}</div>
              )}
              <div>
                <h3 className="modal-title" style={{ marginBottom: 2 }}>
                  {patient.full_name}
                </h3>
                <p className="modal-subtitle" style={{ margin: 0 }}>
                  {patient.patient_id} · {patient.family.family_name}
                </p>
              </div>
              <span className={`badge ${patient.is_active ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 'auto' }}>
                {patient.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="pat-view-grid">
              <div className="pat-view-field">
                <span className="pat-view-label">Age / Gender</span>
                <span className="pat-view-value">
                  {calculateAge(patient.dob)} yrs · {patient.gender}
                </span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Date of Birth</span>
                <span className="pat-view-value">{formatDate(patient.dob)}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Phone</span>
                <span className="pat-view-value">{patient.phone || '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Blood Group</span>
                <span className="pat-view-value">{patient.blood_group || '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">NIC</span>
                <span className="pat-view-value">{patient.nic || '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Guardian NIC</span>
                <span className="pat-view-value">{patient.guardian_nic || '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Last Visit</span>
                <span className="pat-view-value">{patient.last_visit ? formatDate(patient.last_visit) : 'No visits yet'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Registered</span>
                <span className="pat-view-value">{formatDate(patient.created_at)}</span>
              </div>
              <div className="pat-view-field span-2">
                <span className="pat-view-label">Allergies</span>
                <span className="pat-view-value">{patient.allergies || 'None recorded'}</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>
                Close
              </button>
              <button className="modal-btn primary" onClick={onEdit}>
                Edit Patient
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewPatientModal;
