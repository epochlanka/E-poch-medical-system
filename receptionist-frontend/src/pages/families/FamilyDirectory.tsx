import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { listFamilies, getFamilyStats } from '../../lib/families';
import type { ListFamiliesParams, Family } from '../../lib/families';
import {
  FamiliesIcon,
  UsersIcon,
  StarIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MergeIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import NewFamilyModal from './NewFamilyModal';
import EditFamilyModal from './EditFamilyModal';
import ViewFamilyModal from './ViewFamilyModal';
import MergeFamilyModal from './MergeFamilyModal';
import { formatFamilyCode } from './familyUtils';
import { formatDate } from '../patients/patientUtils';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import './familyDirectory.css';

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

const RowMenu = ({ onMerge }: { onMerge: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="pat-icon-btn" onClick={() => setOpen((v) => !v)} aria-label="More actions">
        <MoreVerticalIcon />
      </button>
      {open && (
        <div className="pat-menu">
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

const FamilyDirectory = () => {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListFamiliesParams>({ status: 'all', page: 1, limit: 10 });
  const [showNewFamily, setShowNewFamily] = useState(false);
  const [viewFamilyId, setViewFamilyId] = useState<number | null>(null);
  const [editFamily, setEditFamily] = useState<Family | null>(null);
  const [mergeFamily, setMergeFamily] = useState<Family | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading } = useApiData(getFamilyStats);
  const { data: result, loading, error, reload } = useApiData(() => listFamilies(filters), [JSON.stringify(filters)]);

  const families = result?.data ?? [];
  const pagination = result?.pagination;
  const cityOptions = result?.cityOptions ?? [];
  const familyTypeOptions = result?.familyTypeOptions ?? [];

  const setFilter = (patch: Partial<ListFamiliesParams>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const resetFilters = () => {
    setSearchInput('');
    setFilters({ status: 'all', page: 1, limit: filters.limit });
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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div className="reg-card-icon" style={{ background: '#dbeafe', color: '#2563eb', marginTop: 2 }}>
            <FamiliesIcon />
          </div>
          <div>
            <h1>Family Directory</h1>
            <p>View and manage all patient families in the system.</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          <div className="reg-breadcrumb">
            <Link to="/families/directory" style={{ color: '#2563eb', textDecoration: 'none' }}>
              Families
            </Link>
            <span className="sep">/</span>
            <span className="current">Family Directory</span>
          </div>
          <button className="pat-btn primary" onClick={() => setShowNewFamily(true)}>
            <PlusIcon /> New Family
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
          icon={<UsersIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Total Members"
          value={String(stats?.totalFamilyMembers ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Across all families</span>}
        />
        <KpiCard
          icon={<StarIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Heads of Family"
          value={String(stats?.headsOfFamily ?? 0)}
          loading={statsLoading}
          footer={<span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>Assigned</span>}
        />
        <KpiCard
          icon={<PlusIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Families Added This Month"
          value={String(stats?.newFamiliesThisMonth ?? 0)}
          changePct={stats?.newFamiliesChangePct}
          compareLabel="last month"
          loading={statsLoading}
        />
        <KpiCard
          icon={<FamiliesIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Active Families"
          value={String(stats?.activeFamilies ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ color: '#94a3b8', fontWeight: 500 }}>
              {(stats?.activeFamiliesPct ?? 0).toFixed(1)}% of total
            </span>
          }
        />
      </div>

      <div className="pat-filter-bar">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by family name, head of family, phone…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={filters.status ?? 'all'} onChange={(e) => setFilter({ status: e.target.value as any })}>
          <option value="all">Status: All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select className="pat-select" value={filters.familyType ?? ''} onChange={(e) => setFilter({ familyType: e.target.value || undefined })}>
          <option value="">Relationship: All</option>
          {familyTypeOptions.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <select className="pat-select" value={filters.city ?? ''} onChange={(e) => setFilter({ city: e.target.value || undefined })}>
          <option value="">City: All</option>
          {cityOptions.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <button className="pat-btn" onClick={reload}>
          <FilterIcon /> Filters
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      {pagination && pagination.total > 0 && (
        <div className="pat-pagination-info" style={{ marginBottom: 10 }}>
          Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
          {pagination.total} families
        </div>
      )}

      <div className="pat-table-card">
        <div className="pat-table-scroll">
          <table className="pat-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Family ID</th>
                <th>Family Name</th>
                <th>Head of Family</th>
                <th>Members</th>
                <th>Relationship</th>
                <th>Primary Phone</th>
                <th>City</th>
                <th>Status</th>
                <th>Date Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={11} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                ))}

              {!loading && families.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="pat-empty">No families match these filters.</div>
                  </td>
                </tr>
              )}

              {!loading &&
                families.map((f, i) => (
                  <tr key={f.family_id}>
                    <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 10) + i + 1}</td>
                    <td>
                      <div className="pat-name-cell">
                        <div className="pat-avatar" style={{ width: 28, height: 28 }}>
                          <FamiliesIcon />
                        </div>
                        <button className="pat-id-link" onClick={() => setViewFamilyId(f.family_id)}>
                          {formatFamilyCode(f.family_id)}
                        </button>
                      </div>
                    </td>
                    <td className="pat-name">{f.family_name}</td>
                    <td>{f.head_patient?.full_name || <span className="pat-muted">Not set</span>}</td>
                    <td>{f._count.patients}</td>
                    <td>{f.family_type || <span className="pat-muted">—</span>}</td>
                    <td>{f.contact_no || <span className="pat-muted">—</span>}</td>
                    <td>{f.city || <span className="pat-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${f.is_active ? 'badge-green' : 'badge-amber'}`}>{f.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td>{formatDate(f.created_at)}</td>
                    <td>
                      <div className="pat-actions-cell">
                        <button className="pat-icon-btn" onClick={() => setViewFamilyId(f.family_id)} aria-label="View">
                          <EyeIcon />
                        </button>
                        <button className="pat-icon-btn" onClick={() => setEditFamily(f)} aria-label="Edit">
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
          <div className="pat-pagination">
            <select className="pat-select" value={filters.limit} onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}>
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} per page
                </option>
              ))}
            </select>

            <div className="pat-pagination-pages">
              <button className="pat-page-btn" disabled={pagination.page <= 1} onClick={() => goToPage(1)}>
                «
              </button>
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
              <button className="pat-page-btn" disabled={pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.totalPages)}>
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {showNewFamily && (
        <NewFamilyModal
          onClose={() => setShowNewFamily(false)}
          onSuccess={(familyId) => {
            setShowNewFamily(false);
            setViewFamilyId(familyId);
            reload();
          }}
        />
      )}

      {viewFamilyId && (
        <ViewFamilyModal
          familyId={viewFamilyId}
          onClose={() => setViewFamilyId(null)}
          onEdit={() => {
            const f = families.find((x) => x.family_id === viewFamilyId);
            setViewFamilyId(null);
            if (f) setEditFamily(f);
          }}
        />
      )}

      {editFamily && (
        <EditFamilyModal
          family={editFamily}
          onClose={() => setEditFamily(null)}
          onSaved={() => {
            setEditFamily(null);
            reload();
          }}
        />
      )}

      {mergeFamily && (
        <MergeFamilyModal
          family={mergeFamily}
          onClose={() => setMergeFamily(null)}
          onMerged={() => {
            setMergeFamily(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default FamilyDirectory;
