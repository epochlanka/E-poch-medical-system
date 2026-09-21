import { useEffect, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { searchFamilies, getFamilyMembers, setFamilyHead } from '../../lib/families';
import type { FamilyOption, FamilyMember } from '../../lib/families';
import { formatFamilyCode, displayRelationship } from './familyUtils';
import { calculateAge } from '../patients/patientUtils';
import { SearchIcon, StarIcon, CheckCircleIcon } from '../../components/layout/Icons';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import '../appointments/bookAppointment.css';
import '../appointments/walkIn.css';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const HeadOfFamily = () => {
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState<(FamilyOption & { _count: { patients: number } })[]>([]);
  const [searching, setSearching] = useState(false);
  const [familyId, setFamilyId] = useState<number | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      searchFamilies(searchInput)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, loading, reload } = useApiData(() => (familyId ? getFamilyMembers(familyId) : Promise.resolve(null)), [familyId]);

  const selectFamily = (id: number) => {
    setFamilyId(id);
    setSearchInput('');
    setResults([]);
    setSelectedPatientId(null);
    setSuccess(false);
    setError(null);
  };

  const currentHead = data?.members.find((m) => m.is_head) ?? null;

  const handleSetHead = async () => {
    if (!familyId || !selectedPatientId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await setFamilyHead(familyId, selectedPatientId);
      setSuccess(true);
      setSelectedPatientId(null);
      reload();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update the head of family.');
    } finally {
      setSubmitting(false);
    }
  };

  const MemberRow = ({ m }: { m: FamilyMember }) => (
    <label
      className="appt-row"
      style={{ cursor: m.is_head ? 'default' : 'pointer', borderRadius: 10, padding: '10px 8px', background: selectedPatientId === m.patient_id ? '#f5f8ff' : undefined }}
    >
      {!m.is_head && (
        <input
          type="radio"
          name="new-head"
          checked={selectedPatientId === m.patient_id}
          onChange={() => {
            setSelectedPatientId(m.patient_id);
            setSuccess(false);
          }}
          style={{ marginRight: 10 }}
        />
      )}
      {m.is_head && <span style={{ width: 24, display: 'inline-block' }} />}
      <div className="appt-avatar">{initials(m.full_name)}</div>
      <div className="appt-info">
        <div className="appt-name">
          {m.full_name} {m.is_head && <span className="badge badge-blue" style={{ padding: '2px 7px', marginLeft: 4 }}>Current Head</span>}
        </div>
        <span className="appt-mrn">
          {m.patient_id} · {displayRelationship(m.is_head, m.relationship_to_head)}
        </span>
      </div>
      <span className="pat-muted" style={{ fontSize: 12 }}>
        {calculateAge(m.dob)} yrs · {m.gender}
      </span>
    </label>
  );

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <StarIcon />
            </span>
            Head of Family
          </h1>
          <p>Reassign which family member is recorded as the head of family.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 620, margin: '0 auto 20px' }}>
        <div className="reg-card-header">
          <span className="reg-card-icon">
            <SearchIcon />
          </span>
          <span className="reg-card-title">Select a Family</span>
        </div>
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by family name…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        {searchInput.trim().length >= 2 && (
          <div className="bk-search-results" style={{ marginTop: 8 }}>
            {searching && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>Searching…</div>}
            {!searching && results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>No families found.</div>}
            {!searching &&
              results.map((f) => (
                <div className="bk-search-row" key={f.family_id} onClick={() => selectFamily(f.family_id)}>
                  <div className="pat-avatar">{initials(f.family_name)}</div>
                  <div>
                    <div className="pat-name">{f.family_name}</div>
                    <span className="pat-muted" style={{ fontSize: 11.5 }}>
                      {formatFamilyCode(f.family_id)} · {f._count.patients} member{f._count.patients === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {familyId && (
        <div className="card" style={{ maxWidth: 620, margin: '0 auto' }}>
          {loading && <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading family…</p>}
          {data && (
            <>
              <div className="card-header">
                <div>
                  <h3 className="card-title">{data.family.family_name}</h3>
                  <p className="card-subtitle">
                    {formatFamilyCode(data.family.family_id)} · Current head: {currentHead ? currentHead.full_name : 'Not set'}
                  </p>
                </div>
              </div>

              {error && <div className="dash-error-banner">{error}</div>}
              {success && (
                <div className="wi-confirm-banner" style={{ marginBottom: 12 }}>
                  <CheckCircleIcon /> Head of family updated.
                </div>
              )}

              {data.members.length <= 1 && <div className="card-empty">This family has no other members to reassign the head to.</div>}
              {data.members.map((m) => (
                <MemberRow m={m} key={m.patient_id} />
              ))}

              <div className="modal-actions" style={{ marginTop: 16 }}>
                <button className="modal-btn primary" disabled={!selectedPatientId || submitting} onClick={handleSetHead}>
                  {submitting ? 'Saving…' : 'Set as Head of Family'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HeadOfFamily;
