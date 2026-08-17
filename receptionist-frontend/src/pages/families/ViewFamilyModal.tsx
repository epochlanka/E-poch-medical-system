import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getFamilyMembers } from '../../lib/families';
import { formatFamilyCode } from './familyUtils';
import { FamiliesIcon } from '../../components/layout/Icons';

interface ViewFamilyModalProps {
  familyId: number;
  onClose: () => void;
  onEdit: () => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const calculateAge = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

const ViewFamilyModal = ({ familyId, onClose, onEdit }: ViewFamilyModalProps) => {
  const navigate = useNavigate();
  const { data, loading, error } = useApiData(() => getFamilyMembers(familyId), [familyId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        {loading && <p className="modal-subtitle">Loading family…</p>}
        {error && <div className="modal-error">{error}</div>}

        {data && (
          <>
            <div className="pat-view-header">
              <div className="pat-view-avatar">
                <FamiliesIcon />
              </div>
              <div>
                <h3 className="modal-title" style={{ marginBottom: 2 }}>
                  {data.family.family_name}
                </h3>
                <p className="modal-subtitle" style={{ margin: 0 }}>
                  {formatFamilyCode(data.family.family_id)}
                  {data.family.family_type ? ` · ${data.family.family_type}` : ''}
                </p>
              </div>
              <span className={`badge ${data.family.is_active ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 'auto' }}>
                {data.family.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="pat-view-grid">
              <div className="pat-view-field">
                <span className="pat-view-label">Head of Family</span>
                <span className="pat-view-value">{data.family.head_patient?.full_name || 'Not set'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Primary Phone</span>
                <span className="pat-view-value">{data.family.contact_no || '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">City</span>
                <span className="pat-view-value">{data.family.city || '—'}</span>
              </div>
              <div className="pat-view-field">
                <span className="pat-view-label">Members</span>
                <span className="pat-view-value">{data.members.length}</span>
              </div>
              <div className="pat-view-field span-2">
                <span className="pat-view-label">Address</span>
                <span className="pat-view-value">{data.family.address || '—'}</span>
              </div>
            </div>

            <div className="card-header" style={{ marginTop: 6, marginBottom: 8 }}>
              <h3 className="card-title">Family Members ({data.members.length})</h3>
            </div>
            {data.members.length === 0 && <div className="card-empty">No members yet.</div>}
            {data.members.map((m) => (
              <div className="appt-row" key={m.patient_id}>
                <div className="appt-avatar">{initials(m.full_name)}</div>
                <div className="appt-info">
                  <div className="appt-name">
                    {m.full_name} {m.is_head && <span className="badge badge-blue" style={{ padding: '2px 7px', marginLeft: 4 }}>Head</span>}
                  </div>
                  <span className="appt-mrn">{m.patient_id}</span>
                </div>
                <span className="pat-muted" style={{ fontSize: 12 }}>
                  {calculateAge(m.dob)} yrs · {m.gender}
                </span>
              </div>
            ))}

            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={onClose}>
                Close
              </button>
              <button className="modal-btn secondary" onClick={() => navigate(`/families/roster/${familyId}`)}>
                View Full Roster
              </button>
              <button className="modal-btn primary" onClick={onEdit}>
                Edit Family
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ViewFamilyModal;
