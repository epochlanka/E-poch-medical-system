import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients, getPatientStats, setPatientStatus, getPatient } from '../../lib/patients';
import type { ListPatientsParams, Patient } from '../../lib/patients';
import {
  PatientsIcon,
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
import KpiCard from '../dashboard/KpiCard';
import NewPatientModal from '../dashboard/NewPatientModal';
import ViewPatientModal from './ViewPatientModal';
import EditPatientModal from './EditPatientModal';
import { initials, calculateAge, formatDate } from './patientUtils';
import '../dashboard/dashboard.css';
import './patients.css';

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
  const header = ['Patient ID', 'Name', 'Phone', 'Age', 'Gender', 'Blood Group', 'Last Visit', 'Status'];
  const rows = patients.map((p) => [
    p.patient_id,
    p.full_name,
    p.phone ?? '',
    String(calculateAge(p.dob)),
    p.gender,
    p.blood_group ?? '',
    p.last_visit ? formatDate(p.last_visit) : '',
    p.is_active ? 'Active' : 'Inactive',
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

  const { data: stats, loading: statsLoading } = useApiData(getPatientStats);
  const { data: result, loading, error, reload } = useApiData(() => listPatients(filters), [JSON.stringify(filters)]);

  const patients = result?.data ?? [];
  const pagination = result?.pagination;

  const setFilter = (patch: Partial<ListPatientsParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const resetFilters = () => {
    setSearchInput('');
    setFilters({ status: 'all', page: 1, limit: filters.limit });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { search, status, gender, bloodGroup } = filters;
      const all = await listPatients({ search, status, gender, bloodGroup, page: 1, limit: 1000 });
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
          <h1>Patients</h1>
          <p>Manage all patient records and their information</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewPatient(true)}>
            <PlusIcon /> New Patient
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load patients: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Patients"
          value={String(stats?.totalPatients ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>All time registered</span>}
        />
        <KpiCard
          icon={<PlusIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="New Patients (This Month)"
          value={String(stats?.newPatientsThisMonth ?? 0)}
          changePct={stats?.newPatientsChangePct}
          compareLabel="last month"
          loading={statsLoading}
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Active Patients"
          value={String(stats?.activePatients ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Visited in last 12 months</span>}
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Male Patients"
          value={String(stats?.malePatients ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              {(stats?.malePatientsPct ?? 0).toFixed(1)}% of total
            </span>
          }
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Female Patients"
          value={String(stats?.femalePatients ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              {(stats?.femalePatientsPct ?? 0).toFixed(1)}% of total
            </span>
          }
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by name, NIC, phone, or patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={filters.status ?? 'all'} onChange={(e) => setFilter({ status: e.target.value as any })}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select className="pat-select" value={filters.gender ?? ''} onChange={(e) => setFilter({ gender: e.target.value || undefined })}>
          <option value="">All Genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>

        <select className="pat-select" value={filters.bloodGroup ?? ''} onChange={(e) => setFilter({ bloodGroup: e.target.value || undefined })}>
          <option value="">All Blood Groups</option>
          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
            <option key={bg}>{bg}</option>
          ))}
        </select>

        <button className="pat-btn" onClick={reload}>
          <FilterIcon /> Filter
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Patient ID</th>
                <th>Patient Name</th>
                <th>Phone</th>
                <th>Age / Gender</th>
                <th>Blood Group</th>
                <th>Last Visit</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={9} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                ))}

              {!loading && patients.length === 0 && (
                <tr>
                  <td colSpan={9}>
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
                    <td>{p.phone || <span className="pat-muted">—</span>}</td>
                    <td>
                      {calculateAge(p.dob)} / {p.gender}
                    </td>
                    <td>{p.blood_group ? <span className="badge badge-red">{p.blood_group}</span> : <span className="pat-muted">—</span>}</td>
                    <td>{p.last_visit ? formatDate(p.last_visit) : <span className="pat-muted">Never</span>}</td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
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
