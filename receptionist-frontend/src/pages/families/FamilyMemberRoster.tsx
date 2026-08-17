import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { getFamilyMembers } from '../../lib/families';
import type { FamilyMember } from '../../lib/families';
import { setFamilyHead } from '../../lib/families';
import {
  FamiliesIcon,
  UsersIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  PlusIcon,
  PrintIcon,
  StarIcon,
  DownloadIcon,
} from '../../components/layout/Icons';
import FamilySearchSelect from '../patients/FamilySearchSelect';
import ViewPatientModal from '../patients/ViewPatientModal';
import EditFamilyModal from './EditFamilyModal';
import AddFamilyMemberModal from './AddFamilyMemberModal';
import EditMemberModal from './EditMemberModal';
import { formatFamilyCode, classifyRelationship, displayRelationship, RELATIONSHIP_BUCKET_LABEL, RELATIONSHIP_BUCKET_BADGE } from './familyUtils';
import { formatDate, initials, calculateAge } from '../patients/patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import './familyRoster.css';

const toCsv = (members: FamilyMember[]) => {
  const header = ['Patient ID', 'Full Name', 'Relationship to Head', 'Gender', 'DOB', 'Age', 'NIC/Passport', 'Phone', 'Status'];
  const rows = members.map((m) => [
    m.patient_id,
    m.full_name,
    displayRelationship(m.is_head, m.relationship_to_head),
    m.gender,
    m.dob.slice(0, 10),
    String(calculateAge(m.dob)),
    m.nic ?? '',
    m.phone ?? '',
    m.is_active ? 'Active' : 'Inactive',
  ]);
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
};

const MemberRowMenu = ({ member, onSetHead }: { member: FamilyMember; onSetHead: () => void }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button className="pat-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <MoreVerticalIcon />
      </button>
      {open && (
        <div className="pat-menu">
          {!member.is_head && (
            <button
              onClick={() => {
                setOpen(false);
                onSetHead();
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StarIcon /> Set as Head of Family
              </span>
            </button>
          )}
          {member.is_head && <button disabled>Already Head of Family</button>}
        </div>
      )}
    </div>
  );
};

const FamilyMemberRoster = () => {
  const { familyId } = useParams<{ familyId?: string }>();
  const navigate = useNavigate();
  const [viewPatientId, setViewPatientId] = useState<string | null>(null);
  const [editFamily, setEditFamily] = useState(false);
  const [addMember, setAddMember] = useState(false);
  const [editMember, setEditMember] = useState<FamilyMember | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const numericFamilyId = familyId ? Number(familyId) : null;
  const { data, loading, error, reload } = useApiData(
    () => (numericFamilyId ? getFamilyMembers(numericFamilyId) : Promise.resolve(null)),
    [numericFamilyId]
  );

  const stats = useMemo(() => {
    const members = data?.members ?? [];
    let male = 0;
    let female = 0;
    let children = 0;
    let seniors = 0;
    for (const m of members) {
      if (m.gender === 'Male') male++;
      if (m.gender === 'Female') female++;
      const age = calculateAge(m.dob);
      if (age < 18) children++;
      if (age >= 60) seniors++;
    }
    return { total: members.length, male, female, children, seniors };
  }, [data]);

  const handlePrint = () => window.print();

  const handleExportCsv = () => {
    if (!data) return;
    const csv = toCsv(data.members);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.family.family_name.replace(/\s+/g, '-')}-roster.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSetHead = async (patientId: string) => {
    if (!numericFamilyId) return;
    await setFamilyHead(numericFamilyId, patientId);
    reload();
  };

  if (!numericFamilyId) {
    return (
      <div className="fam-roster-empty">
        <div className="reg-card-icon" style={{ margin: '0 auto', background: '#eaf1fe', color: '#2563eb' }}>
          <FamiliesIcon />
        </div>
        <h2>Select a Family</h2>
        <p>Search for a family to view and manage its member roster.</p>
        <FamilySearchSelect
          selectedId=""
          selectedName=""
          placeholder="Search family by name…"
          onSelect={(id) => navigate(`/families/roster/${id}`)}
          onClear={() => {}}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="pat-header fam-no-print">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div className="reg-card-icon" style={{ background: '#dbeafe', color: '#2563eb', marginTop: 2 }}>
            <UsersIcon />
          </div>
          <div>
            <h1>Family Member Roster</h1>
            <p>View and manage all members of the selected family.</p>
          </div>
        </div>
        <div className="reg-breadcrumb">
          <Link to="/families/directory" style={{ color: '#2563eb', textDecoration: 'none' }}>
            Families
          </Link>
          <span className="sep">/</span>
          <Link to="/families/directory" style={{ color: '#2563eb', textDecoration: 'none' }}>
            Family Directory
          </Link>
          <span className="sep">/</span>
          <span className="current">Family Member Roster</span>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load family: {error}</div>}
      {loading && <div className="card-empty">Loading…</div>}

      {data && (
        <>
          <div className="fam-info-bar">
            <div className="fam-info-top">
              <div className="fam-info-identity">
                <div className="fam-info-icon">
                  <FamiliesIcon />
                </div>
                <div>
                  <div className="fam-info-name">
                    {data.family.family_name}
                    <span className={`badge ${data.family.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {data.family.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="fam-info-actions fam-no-print">
                <button className="pat-btn" onClick={() => setEditFamily(true)}>
                  <EditIcon /> Edit Family Details
                </button>
                <button className="pat-btn" onClick={() => navigate('/families/directory')}>
                  ← Back to Family Directory
                </button>
              </div>
            </div>

            <div className="fam-info-detail-grid">
              <div className="fam-info-detail-field">
                <span className="fam-info-detail-label">Family ID</span>
                <span className="fam-info-detail-value">{formatFamilyCode(data.family.family_id)}</span>
              </div>
              <div className="fam-info-detail-field">
                <span className="fam-info-detail-label">Head of Family</span>
                <span className="fam-info-detail-value">{data.family.head_patient?.full_name || 'Not set'}</span>
              </div>
              <div className="fam-info-detail-field">
                <span className="fam-info-detail-label">Relationship</span>
                <span className="fam-info-detail-value">{data.family.family_type || '—'}</span>
              </div>
              <div className="fam-info-detail-field">
                <span className="fam-info-detail-label">Primary Phone</span>
                <span className="fam-info-detail-value">{data.family.contact_no || '—'}</span>
              </div>
              <div className="fam-info-detail-field">
                <span className="fam-info-detail-label">Address</span>
                <span className="fam-info-detail-value">{data.family.address || '—'}</span>
              </div>
            </div>
          </div>

          <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <KpiTile icon={<UsersIcon />} bg="#eaf1fe" color="#2563eb" label="Total Members" value={stats.total} />
            <KpiTile icon={<UsersIcon />} bg="#dcfce7" color="#16a34a" label="Male Members" value={stats.male} />
            <KpiTile icon={<UsersIcon />} bg="#fce7f3" color="#be185d" label="Female Members" value={stats.female} />
            <KpiTile icon={<UsersIcon />} bg="#f3e8ff" color="#7c3aed" label="Children" value={stats.children} />
            <KpiTile icon={<UsersIcon />} bg="#fef3c7" color="#b45309" label="Seniors (60+)" value={stats.seniors} />
          </div>

          <div className="pat-table-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 0' }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                Family Members
              </h3>
              <div className="fam-no-print" ref={moreRef} style={{ display: 'flex', gap: 10, position: 'relative' }}>
                <button className="pat-btn primary" onClick={() => setAddMember(true)}>
                  <PlusIcon /> Add New Member
                </button>
                <button className="pat-btn" onClick={handlePrint}>
                  <PrintIcon /> Print Roster
                </button>
                <button className="pat-icon-btn" onClick={() => setMoreOpen((v) => !v)} aria-label="More">
                  <MoreVerticalIcon />
                </button>
                {moreOpen && (
                  <div className="pat-menu" style={{ top: 40 }}>
                    <button
                      onClick={() => {
                        setMoreOpen(false);
                        handleExportCsv();
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <DownloadIcon /> Export CSV
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="pat-table-scroll" style={{ marginTop: 12 }}>
              <table className="pat-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Patient ID</th>
                    <th>Photo</th>
                    <th>Full Name</th>
                    <th>Relationship to Head</th>
                    <th>Gender</th>
                    <th>DOB / Age</th>
                    <th>NIC / Passport</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th className="fam-no-print">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.length === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <div className="pat-empty">No members in this family yet.</div>
                      </td>
                    </tr>
                  )}
                  {data.members.map((m, i) => {
                    const bucket = classifyRelationship(m.is_head, m.relationship_to_head);
                    return (
                      <tr key={m.patient_id}>
                        <td className="pat-muted">{i + 1}</td>
                        <td>
                          <button className="pat-id-link" onClick={() => setViewPatientId(m.patient_id)}>
                            {m.patient_id}
                          </button>
                        </td>
                        <td>
                          {m.photo_url ? (
                            <img className="pat-avatar" src={fileUrl(m.photo_url)} alt="" />
                          ) : (
                            <div className="pat-avatar">{initials(m.full_name)}</div>
                          )}
                        </td>
                        <td>
                          <div className="pat-name">{m.full_name}</div>
                          <span className={`badge ${RELATIONSHIP_BUCKET_BADGE[bucket]}`} style={{ marginTop: 3, display: 'inline-block' }}>
                            {RELATIONSHIP_BUCKET_LABEL[bucket]}
                          </span>
                        </td>
                        <td>{displayRelationship(m.is_head, m.relationship_to_head)}</td>
                        <td>{m.gender}</td>
                        <td>
                          {formatDate(m.dob)} ({calculateAge(m.dob)} Y)
                        </td>
                        <td>{m.nic || <span className="pat-muted">—</span>}</td>
                        <td>{m.phone || <span className="pat-muted">—</span>}</td>
                        <td>
                          <span className={`badge ${m.is_active ? 'badge-green' : 'badge-amber'}`}>{m.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td className="fam-no-print">
                          <div className="pat-actions-cell">
                            <button className="pat-icon-btn" onClick={() => setViewPatientId(m.patient_id)} aria-label="View">
                              <EyeIcon />
                            </button>
                            <button className="pat-icon-btn" onClick={() => setEditMember(m)} aria-label="Edit">
                              <EditIcon />
                            </button>
                            <MemberRowMenu member={m} onSetHead={() => handleSetHead(m.patient_id)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pat-pagination">
              <div className="pat-pagination-info">Showing 1 to {data.members.length} of {data.members.length} members</div>
              <div className="fam-legend">
                <span className="fam-legend-item">
                  <span className="fam-legend-swatch head" /> Head of Family
                </span>
                <span className="fam-legend-item">
                  <span className="fam-legend-swatch spouse" /> Spouse
                </span>
                <span className="fam-legend-item">
                  <span className="fam-legend-swatch child" /> Children
                </span>
                <span className="fam-legend-item">
                  <span className="fam-legend-swatch other" /> Other Members
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {viewPatientId && (
        <ViewPatientModal
          patientId={viewPatientId}
          onClose={() => setViewPatientId(null)}
          onEdit={() => {
            const member = data?.members.find((m) => m.patient_id === viewPatientId) ?? null;
            setViewPatientId(null);
            setEditMember(member);
          }}
        />
      )}

      {editFamily && data && (
        <EditFamilyModal
          family={{
            family_id: data.family.family_id,
            family_name: data.family.family_name,
            head_patient_id: data.family.head_patient?.patient_id ?? null,
            address: data.family.address,
            city: data.family.city,
            family_type: data.family.family_type,
            contact_no: data.family.contact_no,
            is_active: data.family.is_active,
            created_at: '',
            head_patient: data.family.head_patient,
            _count: { patients: data.members.length },
          }}
          onClose={() => setEditFamily(false)}
          onSaved={() => {
            setEditFamily(false);
            reload();
          }}
        />
      )}

      {addMember && data && (
        <AddFamilyMemberModal
          familyId={data.family.family_id}
          familyName={data.family.family_name}
          onClose={() => setAddMember(false)}
          onSuccess={() => {
            setAddMember(false);
            reload();
          }}
        />
      )}

      {editMember && data && (
        <EditMemberModal
          member={editMember}
          familyName={data.family.family_name}
          onClose={() => setEditMember(null)}
          onSaved={() => {
            setEditMember(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

const KpiTile = ({ icon, bg, color, label, value }: { icon: React.ReactNode; bg: string; color: string; label: string; value: number }) => (
  <div className="kpi-card">
    <div className="kpi-card-top">
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
      </div>
      <div className="kpi-icon" style={{ background: bg, color }}>
        {icon}
      </div>
    </div>
  </div>
);

export default FamilyMemberRoster;
