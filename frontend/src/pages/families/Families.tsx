import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { listFamilies, getFamilyStats, getFamilyMembers } from '../../lib/families';
import type { ListFamiliesParams, Family } from '../../lib/families';
import {
  FamiliesIcon,
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
  MapPinIcon,
  PhoneIcon,
  StarIcon,
  MergeIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import NewFamilyModal from './NewFamilyModal';
import EditFamilyModal from './EditFamilyModal';
import AddFamilyMemberModal from './AddFamilyMemberModal';
import MergeFamilyModal from './MergeFamilyModal';
import { formatFamilyCode } from './familyUtils';
import { initials, calculateAge } from '../patients/patientUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import './families.css';

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

const toCsv = (families: Family[]) => {
  const header = ['Family ID', 'Family Name', 'Address', 'Phone', 'Members', 'Head of Family', 'Status'];
  const rows = families.map((f) => [
    formatFamilyCode(f.family_id),
    f.family_name,
    f.address ?? '',
    f.contact_no ?? '',
    String(f._count.patients),
    f.head_patient?.full_name ?? '',
    f.is_active ? 'Active' : 'Inactive',
  ]);
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
};

const RowMenu = ({ onMerge }: { onMerge: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="fam-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <MoreVerticalIcon />
      </button>
      {open && (
        <div className="fam-menu">
          <button
            onClick={() => {
              setOpen(false);
              onMerge();
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <MergeIcon /> Merge into…
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

const Families = () => {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListFamiliesParams>({ status: 'all', page: 1, limit: 8 });
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [editFamily, setEditFamily] = useState<Family | null>(null);
  const [addMemberFamily, setAddMemberFamily] = useState<Family | null>(null);
  const [mergeFamily, setMergeFamily] = useState<Family | null>(null);
  const [selectedFamilyId, setSelectedFamilyId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading } = useApiData(getFamilyStats);
  const { data: result, loading, error, reload } = useApiData(() => listFamilies(filters), [JSON.stringify(filters)]);

  const families = result?.data ?? [];
  const pagination = result?.pagination;

  useEffect(() => {
    if (!selectedFamilyId && families.length > 0) setSelectedFamilyId(families[0].family_id);
  }, [families, selectedFamilyId]);

  const {
    data: overview,
    loading: overviewLoading,
    reload: reloadOverview,
  } = useApiData(() => (selectedFamilyId ? getFamilyMembers(selectedFamilyId) : Promise.resolve(null)), [selectedFamilyId]);

  const setFilter = (patch: Partial<ListFamiliesParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const resetFilters = () => {
    setSearchInput('');
    setFilters({ status: 'all', page: 1, limit: filters.limit });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { search, status } = filters;
      const all = await listFamilies({ search, status, page: 1, limit: 1000 });
      const csv = toCsv(all.data);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `families-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const refreshAll = () => {
    reload();
    reloadOverview();
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
      <div className="fam-header">
        <div>
          <h1>Families</h1>
          <p>Manage household records and their members</p>
        </div>
        <div className="pat-header-actions">
          <button className="fam-btn" onClick={handleExport} disabled={exporting}>
            <DownloadIcon /> {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button className="fam-btn primary" onClick={() => setShowNewFamily(true)}>
            <PlusIcon /> Add New Family
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load families: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<FamiliesIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Total Families"
          value={String(stats?.totalFamilies ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>All time</span>}
        />
        <KpiCard
          icon={<PlusIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="New Families (This Month)"
          value={String(stats?.newFamiliesThisMonth ?? 0)}
          changePct={stats?.newFamiliesChangePct}
          compareLabel="last month"
          loading={statsLoading}
        />
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Total Family Members"
          value={String(stats?.totalFamilyMembers ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>All time members</span>}
        />
        <KpiCard
          icon={<FamiliesIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Active Families"
          value={String(stats?.activeFamilies ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              {(stats?.activeFamiliesPct ?? 0).toFixed(1)}% of total
            </span>
          }
        />
        <KpiCard
          icon={<FamiliesIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Inactive Families"
          value={String(stats?.inactiveFamilies ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              {(stats?.inactiveFamiliesPct ?? 0).toFixed(1)}% of total
            </span>
          }
        />
      </div>

      <div className="fam-filter-bar">
        <div className="fam-search">
          <SearchIcon />
          <input placeholder="Search by family name, address, or phone…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="fam-select" value={filters.status ?? 'all'} onChange={(e) => setFilter({ status: e.target.value as any })}>
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <button className="fam-btn" onClick={reload}>
          <FilterIcon /> Filter
        </button>
        <button className="fam-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      <div className="fam-layout">
        <div className="fam-table-card">
          <div className="fam-table-scroll">
            <table className="fam-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Family ID</th>
                  <th>Family Name</th>
                  <th>Address</th>
                  <th>Members</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="fam-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}

                {!loading && families.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="fam-empty">No families match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  families.map((f, i) => (
                    <tr key={f.family_id} className={f.family_id === selectedFamilyId ? 'selected' : ''} onClick={() => setSelectedFamilyId(f.family_id)}>
                      <td className="fam-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 8) + i + 1}</td>
                      <td>
                        <button className="fam-id-link" onClick={(e) => (e.stopPropagation(), setSelectedFamilyId(f.family_id))}>
                          {formatFamilyCode(f.family_id)}
                        </button>
                      </td>
                      <td className="pat-name">{f.family_name}</td>
                      <td>{f.address || <span className="fam-muted">—</span>}</td>
                      <td>{f._count.patients}</td>
                      <td>{f.contact_no || <span className="fam-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${f.is_active ? 'badge-green' : 'badge-red'}`}>{f.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="fam-actions-cell">
                          <button className="fam-icon-btn" onClick={() => setSelectedFamilyId(f.family_id)} aria-label="View">
                            <EyeIcon />
                          </button>
                          <button className="fam-icon-btn" onClick={() => setEditFamily(f)} aria-label="Edit">
                            <EditIcon />
                          </button>
                          {f.is_active && <RowMenu onMerge={() => setMergeFamily(f)} />}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="fam-pagination">
              <div className="fam-pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} families
              </div>

              <div className="fam-pagination-pages">
                <button className="fam-page-btn" disabled={pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>
                  <ChevronLeftIcon />
                </button>
                {pageNumbers.map((p, i) => {
                  const prev = pageNumbers[i - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {showEllipsis && <span className="fam-page-ellipsis">…</span>}
                      <button className={`fam-page-btn${p === pagination.page ? ' active' : ''}`} onClick={() => goToPage(p)}>
                        {p}
                      </button>
                    </span>
                  );
                })}
                <button className="fam-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>
                  <ChevronRightIcon />
                </button>
              </div>

              <select className="fam-select" value={filters.limit} onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}>
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="card" style={{ position: 'sticky', top: 84 }}>
          {!overview && overviewLoading && <p className="card-subtitle">Loading…</p>}
          {!selectedFamilyId && !overviewLoading && <div className="fam-empty-selection">Select a family to see its details.</div>}

          {overview && (
            <>
              <div className="fam-overview-top">
                <div>
                  <div className="fam-overview-icon">
                    <FamiliesIcon />
                  </div>
                  <div className="fam-overview-name">{overview.family.family_name}</div>
                  <div className="fam-overview-id">{formatFamilyCode(overview.family.family_id)}</div>
                </div>
                <span className={`badge ${overview.family.is_active ? 'badge-green' : 'badge-red'}`}>
                  {overview.family.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="fam-detail-row">
                  <span className="fam-detail-icon">
                    <MapPinIcon />
                  </span>
                  <span className="fam-detail-label">Address</span>
                  <span>{overview.family.address || '—'}</span>
                </div>
                <div className="fam-detail-row">
                  <span className="fam-detail-icon">
                    <PhoneIcon />
                  </span>
                  <span className="fam-detail-label">Phone</span>
                  <span>{overview.family.contact_no || '—'}</span>
                </div>
                <div className="fam-detail-row">
                  <span className="fam-detail-icon">
                    <StarIcon />
                  </span>
                  <span className="fam-detail-label">Head</span>
                  <span>{overview.family.head_patient?.full_name || 'Not set'}</span>
                </div>
              </div>

              <div className="card-header">
                <h3 className="card-title">Family Members ({overview.members.length})</h3>
              </div>

              {overview.members.length === 0 && <div className="card-empty">No members yet.</div>}
              {overview.members.map((m) => (
                <div className="fam-member-row" key={m.patient_id}>
                  <div className="fam-member-avatar">{initials(m.full_name)}</div>
                  <div className="fam-member-info">
                    <div className="fam-member-name">
                      {m.full_name}
                      {m.is_head && (
                        <span className="badge badge-blue" style={{ padding: '2px 7px' }}>
                          Head
                        </span>
                      )}
                    </div>
                    <div className="fam-member-meta">
                      {calculateAge(m.dob)} yrs · {m.gender}
                    </div>
                  </div>
                </div>
              ))}

              <button className="fam-btn primary block" style={{ marginTop: 14 }} onClick={() => setAddMemberFamily(families.find((f) => f.family_id === selectedFamilyId) ?? null)}>
                <PlusIcon /> Add Family Member
              </button>
            </>
          )}
        </div>
      </div>

      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}
          onSuccess={(familyId) => {
            setShowNewFamily(false);
            setSelectedFamilyId(familyId);
            reload();
          }}
        />
      )}

      {editFamily && (
        <EditFamilyModal
          family={editFamily}
          onClose={() => setEditFamily(null)}
          onSaved={() => {
            setEditFamily(null);
            refreshAll();
          }}
        />
      )}

      {addMemberFamily && (
        <AddFamilyMemberModal
          familyId={addMemberFamily.family_id}
          familyName={addMemberFamily.family_name}
          onClose={() => setAddMemberFamily(null)}
          onSuccess={() => {
            setAddMemberFamily(null);
            refreshAll();
          }}
        />
      )}

      {mergeFamily && (
        <MergeFamilyModal
          family={mergeFamily}
          onClose={() => setMergeFamily(null)}
          onMerged={() => {
            setMergeFamily(null);
            setSelectedFamilyId(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default Families;
