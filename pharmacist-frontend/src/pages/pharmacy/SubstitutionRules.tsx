import { useEffect, useMemo, useRef, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { getSubstitutionStats, listSubstitutions, updateSubstitution } from '../../lib/pharmacy';
import type { SubstitutionRule, SubstitutionStatusFilter, SubstitutionType } from '../../lib/pharmacy';
import KpiCard from '../dashboard/KpiCard';
import SubstitutionRuleModal from './SubstitutionRuleModal';
import { RefreshIcon, PlusIcon, SearchIcon, EditIcon, MoreVerticalIcon, ClipboardIcon, FileIcon, StockIcon, XCircleIcon } from '../../components/layout/Icons';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../prescriptions/prescriptions.css';
import './dispensing.css';

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

const SubstitutionRules = () => {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SubstitutionStatusFilter>('all');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [selected, setSelected] = useState<SubstitutionRule | null>(null);
  const [editPriority, setEditPriority] = useState(1);
  const [editType, setEditType] = useState<SubstitutionType>('Manual');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: stats, reload: reloadStats } = useApiData(() => getSubstitutionStats(), []);
  const { data: rules, loading, reload: reloadRules } = useApiData(() => listSubstitutions({ status: statusFilter }), [statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    if (!search) return rules;
    return rules.filter((r) => `${r.medicineName} ${r.substituteMedicineName} ${r.therapeuticClass ?? ''}`.toLowerCase().includes(search));
  }, [rules, search]);

  const reloadAll = () => {
    reloadRules();
    reloadStats();
  };

  const selectRule = (r: SubstitutionRule) => {
    setSelected(r);
    setEditPriority(r.priority);
    setEditType(r.type);
    setEditActive(r.isActive);
    setOpenMenuId(null);
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateSubstitution(selected.substitutionId, { priority: editPriority, type: editType, is_active: editActive });
      setSelected(null);
      reloadAll();
    } finally {
      setSaving(false);
    }
  };

  const quickToggle = async (r: SubstitutionRule) => {
    setOpenMenuId(null);
    await updateSubstitution(r.substitutionId, { is_active: !r.isActive });
    if (selected?.substitutionId === r.substitutionId) setSelected(null);
    reloadAll();
  };

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <RefreshIcon />
            </span>
            Substitution Rules
          </h1>
          <p>Manage medicine substitution rules and preferences.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn primary" onClick={() => setShowAddModal(true)}>
            <PlusIcon /> Add New Rule
          </button>
        </div>
      </div>

      <div className="dash-kpi-row">
        <KpiCard icon={<FileIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total Rules" value={String(stats?.total ?? 0)} loading={!stats} />
        <KpiCard icon={<ClipboardIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Active Rules" value={String(stats?.active ?? 0)} loading={!stats} />
        <KpiCard icon={<XCircleIcon />} iconBg="#fee2e2" iconColor="#dc2626" label="Inactive Rules" value={String(stats?.inactive ?? 0)} loading={!stats} />
        <KpiCard icon={<StockIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Auto Substitution" value={String(stats?.autoCount ?? 0)} loading={!stats} />
        <KpiCard icon={<FileIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Manual Approval" value={String(stats?.manualCount ?? 0)} loading={!stats} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div className="pat-table-card" style={{ minWidth: 0 }}>
          <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Substitution Rules</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pat-search" style={{ width: 200 }}>
                <SearchIcon />
                <input placeholder="Search rules…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
              </div>
              <select className="pat-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SubstitutionStatusFilter)}>
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <button className="pat-icon-btn" title="Refresh" onClick={reloadAll}>
                <RefreshIcon />
              </button>
            </div>
          </div>
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>From Medicine</th>
                  <th>To Medicine (Alternative)</th>
                  <th>Therapeutic Class</th>
                  <th>Priority</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="pat-muted">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filteredRules.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="pat-empty">No substitution rules match this filter.</div>
                    </td>
                  </tr>
                )}
                {!loading &&
                  filteredRules.map((r, i) => (
                    <tr key={r.substitutionId} style={selected?.substitutionId === r.substitutionId ? { background: '#f5f8ff' } : undefined}>
                      <td className="pat-muted">{i + 1}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{r.medicineName}</td>
                      <td>{r.substituteMedicineName}</td>
                      <td>{r.therapeuticClass || '—'}</td>
                      <td>
                        <span className={`badge ${r.priority === 1 ? 'badge-green' : r.priority === 2 ? 'badge-amber' : 'badge-blue'}`}>{r.priority}</span>
                      </td>
                      <td>
                        <span className={`badge ${r.type === 'Auto' ? 'badge-purple' : 'badge-blue'}`}>{r.type}</span>
                      </td>
                      <td>
                        <span className={`badge ${r.isActive ? 'badge-green' : 'badge-red'}`}>{r.isActive ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', position: 'relative' }}>
                          <button className="pat-icon-btn" title="Edit" onClick={() => selectRule(r)}>
                            <EditIcon />
                          </button>
                          <button className="pat-icon-btn" title="More" onClick={() => setOpenMenuId(openMenuId === r.substitutionId ? null : r.substitutionId)}>
                            <MoreVerticalIcon />
                          </button>
                          {openMenuId === r.substitutionId && (
                            <div ref={menuRef} className="pat-menu">
                              <button onClick={() => quickToggle(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {rules && (
            <div className="pat-pagination">
              <div className="pat-pagination-info">Showing {filteredRules.length} of {rules.length} entries</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Rule Details</h3>
            </div>
            {!selected ? (
              <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                <div style={{ color: '#cbd5e1', marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                  <FileIcon />
                </div>
                <div style={{ fontWeight: 700, color: '#334155', fontSize: 14 }}>No rule selected</div>
                <div className="pat-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Select a substitution rule from the list to view details.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div className="pat-muted" style={{ fontSize: 11.5 }}>From → To</div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>
                    {selected.medicineName} → {selected.substituteMedicineName}
                  </div>
                </div>
                <div className="disp-summary-row">
                  <span>Therapeutic Class</span>
                  <span className="value">{selected.therapeuticClass || '—'}</span>
                </div>
                <div className="modal-field">
                  <label>Priority</label>
                  <select value={editPriority} onChange={(e) => setEditPriority(Number(e.target.value))}>
                    <option value={1}>1 — First Priority</option>
                    <option value={2}>2 — Second Priority</option>
                    <option value={3}>3 — Third Priority</option>
                    <option value={4}>4+ — Lower Priority</option>
                  </select>
                </div>
                <div className="modal-field">
                  <label>Type</label>
                  <select value={editType} onChange={(e) => setEditType(e.target.value as SubstitutionType)}>
                    <option value="Auto">Auto</option>
                    <option value="Manual">Manual</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155' }}>
                  <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                  Active
                </label>
                <div className="disp-summary-row">
                  <span>Created By</span>
                  <span className="value">{selected.createdBy}</span>
                </div>
                <div className="disp-summary-row">
                  <span>Created At</span>
                  <span className="value">{formatDateTime(selected.createdAt)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className="pat-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelected(null)} disabled={saving}>
                    Cancel
                  </button>
                  <button className="pat-btn primary" style={{ flex: 1, justifyContent: 'center' }} onClick={saveEdit} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Rule Priority Guide</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-green">1</span>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>First Priority (Most Preferred)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-amber">2</span>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>Second Priority</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-blue">3</span>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>Third Priority</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge badge-gray">4+</span>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>Lower Priority</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Rule Type Guide</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-purple">Auto</span>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>Pre-approved for quick pharmacist selection during dispensing.</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="badge badge-blue">Manual</span>
                <span className="pat-muted" style={{ fontSize: 12.5 }}>Requires the pharmacist to confirm before use.</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-error-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af', marginTop: 16 }}>
        Substitution rules help ensure continuous treatment when prescribed medicines are not available. FEFO (First Expiry First Out) is applied
        during dispensing.
      </div>

      {showAddModal && (
        <SubstitutionRuleModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            reloadAll();
          }}
        />
      )}
    </div>
  );
};

export default SubstitutionRules;
