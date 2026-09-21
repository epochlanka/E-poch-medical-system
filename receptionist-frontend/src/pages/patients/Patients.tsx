import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients, setPatientStatus, getPatient } from '../../lib/patients';
import type { ListPatientsParams, Patient } from '../../lib/patients';
import FamilySearchSelect from './FamilySearchSelect';
import {
  PlusIcon,
  SearchIcon,
  DownloadIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import NewPatientModal from './NewPatientModal';
import ViewPatientModal from './ViewPatientModal';
import EditPatientModal from './EditPatientModal';
import { initials, calculateAge, formatDate, AGE_GROUPS } from './patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

const useClickOutside = (onOutside: () => void) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onOutside]);
  return ref;
};

const toCsv = (patients: Patient[]) => {
  const header = ['Patient ID', 'Name', 'NIC/Passport', 'Phone', 'Gender', 'DOB', 'Age', 'Blood Group', 'Family', 'Status', 'Last Visit'];
  const rows = patients.map((p) => [
    p.patient_id,
    p.full_name,
    p.nic ?? p.guardian_nic ?? '',
    p.phone ?? '',
    p.gender,
    p.dob.slice(0, 10),
    String(calculateAge(p.dob)),
    p.blood_group ?? '',
    p.family.family_name,
    p.is_active ? 'Active' : 'Inactive',
    p.last_visit ? formatDate(p.last_visit) : '',
  ]);
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
};

const RowMenu = ({ patient, onDeactivate, onActivate }: { patient: Patient; onDeactivate: () => void; onActivate: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="pat-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <MoreVerticalIcon />
      </button>
      {open && (
        <div className="pat-menu">
          {patient.is_active ? (
            <button
              className="danger"
              onClick={() => {
                setOpen(false);
                onDeactivate();
              }}
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => {
                setOpen(false);
                onActivate();
              }}
            >
              Reactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const Patients = () => {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListPatientsParams>({ status: 'all', page: 1, limit: 10 });
  const [ageGroup, setAgeGroup] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [viewPatientId, setViewPatientId] = useState<string | null>(null);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [exporting, setExporting] = useState(false);

  // Debounce free-text search so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: result, loading, error, reload } = useApiData(() => listPatients(filters), [JSON.stringify(filters)]);

  const patients = result?.data ?? [];
  const pagination = result?.pagination;

  const setFilter = (patch: Partial<ListPatientsParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const handleAgeGroupChange = (value: string) => {
    setAgeGroup(value);
    const group = AGE_GROUPS.find((g) => g.label === value);
    setFilter({ ageFrom: group?.ageFrom, ageTo: group?.ageTo });
  };

  const resetFilters = () => {
    setSearchInput('');
    setAgeGroup('');
    setFamilyName('');
    setFilters({ status: 'all', page: 1, limit: filters.limit });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { search, status, gender, bloodGroup, ageFrom, ageTo, familyId } = filters;
      const all = await listPatients({ search, status, gender, bloodGroup, ageFrom, ageTo, familyId, page: 1, limit: 1000 });
      const csv = toCsv(all.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `patients-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleStatusChange = async (patientId: string, is_active: boolean) => {
    await setPatientStatus(patientId, is_active);
    reload();
  };

  const openEdit = async (patientId: string) => {
    const patient = await getPatient(patientId);
    setEditPatient(patient);
  };

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];
    const { page, totalPages } = pagination;
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);

    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    return Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [pagination]);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>All Patients</h1>
          <p>View, search and manage all registered patients.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn primary" onClick={() => setShowNewPatient(true)}>
            <PlusIcon /> Register New Patient
          </button>
          <button className="pat-btn" onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load patients: {error}</div>}

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by name, NIC, phone or Patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={filters.status ?? 'all'} onChange={(e) => setFilter({ status: e.target.value as any })}>
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select className="pat-select" value={filters.gender ?? ''} onChange={(e) => setFilter({ gender: e.target.value || undefined })}>
          <option value="">Gender: All</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>

        <select className="pat-select" value={ageGroup} onChange={(e) => handleAgeGroupChange(e.target.value)}>
          <option value="">Age Group: All</option>
          {AGE_GROUPS.map((g) => (
            <option key={g.label}>{g.label}</option>
          ))}
        </select>

        <select className="pat-select" value={filters.bloodGroup ?? ''} onChange={(e) => setFilter({ bloodGroup: e.target.value || undefined })}>
          <option value="">Blood Group: All</option>
          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
            <option key={bg}>{bg}</option>
          ))}
        </select>

        <div style={{ minWidth: 200 }}>
          <FamilySearchSelect
            selectedId={filters.familyId ? String(filters.familyId) : ''}
            selectedName={familyName}
            placeholder="Family: All"
            onSelect={(id, name) => {
              setFamilyName(name);
              setFilter({ familyId: Number(id) });
            }}
            onClear={() => {
              setFamilyName('');
              setFilter({ familyId: undefined });
            }}
          />
        </div>

        <button className="pat-btn" onClick={reload}>
          <FilterIcon /> Filters
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="pat-pagination-info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span>
            Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} patients
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Rows per page:
            <select
              className="pat-select"
              value={filters.limit}
              onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </div>
      )}

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Patient ID</th>
                <th>Patient Name</th>
                <th>NIC / Passport</th>
                <th>Phone</th>
                <th>Gender</th>
                <th>DOB / Age</th>
                <th>Blood Group</th>
                <th>Family</th>
                <th>Status</th>
                <th>Last Visit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={12} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                ))}

              {!loading && patients.length === 0 && (
                <tr>
                  <td colSpan={12}>
                    <div className="pat-empty">No patients match these filters.</div>
                  </td>
                </tr>
              )}

              {!loading &&
                patients.map((p, i) => (
                  <tr key={p.patient_id}>
                    <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 10) + i + 1}</td>
                    <td>
                      <button className="pat-id-link" onClick={() => setViewPatientId(p.patient_id)}>
                        {p.patient_id}
                      </button>
                    </td>
                    <td>
                      <div className="pat-name-cell">
                        {p.photo_url ? (
                          <img className="pat-avatar" src={fileUrl(p.photo_url)} alt={p.full_name} />
                        ) : (
                          <div className="pat-avatar">{initials(p.full_name)}</div>
                        )}
                        <span className="pat-name">{p.full_name}</span>
                      </div>
                    </td>
                    <td>{p.nic || p.guardian_nic || <span className="pat-muted">—</span>}</td>
                    <td>{p.phone || <span className="pat-muted">—</span>}</td>
                    <td>
                      <span
                        className="badge"
                        style={
                          p.gender === 'Female'
                            ? { background: '#fce7f3', color: '#be185d' }
                            : p.gender === 'Male'
                              ? { background: '#dbeafe', color: '#1d4ed8' }
                              : { background: '#f1f5f9', color: '#64748b' }
                        }
                      >
                        {p.gender}
                      </span>
                    </td>
                    <td>
                      {formatDate(p.dob)} ({calculateAge(p.dob)} Y)
                    </td>
                    <td>{p.blood_group ? <span className="badge badge-red">{p.blood_group}</span> : <span className="pat-muted">—</span>}</td>
                    <td>{p.family.family_name}</td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-green' : 'badge-amber'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>{p.last_visit ? formatDate(p.last_visit) : <span className="pat-muted">Never</span>}</td>
                    <td>
                      <div className="pat-actions-cell">
                        <button className="pat-icon-btn" onClick={() => setViewPatientId(p.patient_id)} aria-label="View">
                          <EyeIcon />
                        </button>
                        <button className="pat-icon-btn" onClick={() => openEdit(p.patient_id)} aria-label="Edit">
                          <EditIcon />
                        </button>
                        <RowMenu
                          patient={p}
                          onDeactivate={() => handleStatusChange(p.patient_id, false)}
                          onActivate={() => handleStatusChange(p.patient_id, true)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 && (
          <div className="pat-pagination">
            <div className="pat-pagination-info">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} patients
            </div>

            <div className="pat-pagination-pages">
              <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
                <ChevronLeftIcon />
              </button>
              {pageNumbers.map((p, i) => {
                const prev = pageNumbers[i - 1];
                const showEllipsis = prev !== undefined && p - prev > 1;
                return (
                  <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                    <button className={`pat-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => goToPage(p)}>
                      {p}
                    </button>
                  </span>
                );
              })}
              <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
                <ChevronRightIcon />
              </button>
            </div>

            <select
              className="pat-select"
              value={filters.limit}
              onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {showNewPatient && (
        <NewPatientModal
          onClose={() => setShowNewPatient(false)}
          onSuccess={() => {
            reload();
          }}
        />
      )}

      {viewPatientId && (
        <ViewPatientModal
          patientId={viewPatientId}
          onClose={() => setViewPatientId(null)}
          onEdit={async () => {
            const patient = await getPatient(viewPatientId);
            setViewPatientId(null);
            setEditPatient(patient);
          }}
        />
      )}

      {editPatient && (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={() => {
            setEditPatient(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default Patients;
