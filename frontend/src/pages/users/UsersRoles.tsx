import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { listUsers, getPermissionMatrix, updateUser, unlockUser, ROLES } from '../../lib/security';
import type { SecurityUser, Role } from '../../lib/security';
import {
  PlusIcon,
  DownloadIcon,
  ClipboardIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/layout/Icons';
import { ROLE_BADGE, ROLE_LABEL, STATUS_BADGE, formatDateTime, initials, isLocked, userStatus } from './usersRolesUtils';
import RolePermissionsPanel from './RolePermissionsPanel';
import RolesMatrixTab from './RolesMatrixTab';
import UserFormModal from './UserFormModal';
import ViewUserModal from './ViewUserModal';
import ResetPasswordModal from './ResetPasswordModal';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import './users.css';

const PER_PAGE = 10;

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

const RowMenu = ({
  user,
  currentUserId,
  onResetPassword,
  onUnlock,
  onToggleActive,
}: {
  user: SecurityUser;
  currentUserId: number | undefined;
  onResetPassword: () => void;
  onUnlock: () => void;
  onToggleActive: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const isSelf = user.user_id === currentUserId;

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
              onResetPassword();
            }}
          >
            Reset Password
          </button>
          {isLocked(user) && (
            <button
              onClick={() => {
                setOpen(false);
                onUnlock();
              }}
            >
              Unlock Account
            </button>
          )}
          <button
            className={user.is_active ? 'danger' : ''}
            disabled={isSelf && user.is_active}
            title={isSelf && user.is_active ? 'You cannot deactivate your own account' : undefined}
            onClick={() => {
              setOpen(false);
              onToggleActive();
            }}
          >
            {user.is_active ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
      )}
    </div>
  );
};

const UsersRoles = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Active' | 'Inactive' | 'Locked'>('all');
  const [page, setPage] = useState(1);
  const [selectedRole, setSelectedRole] = useState<Role>('Admin');

  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState<SecurityUser | null>(null);
  const [viewUser, setViewUser] = useState<SecurityUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<SecurityUser | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: users, loading, error, reload } = useApiData(() => listUsers(true));
  const { data: matrix } = useApiData(getPermissionMatrix);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (q && !u.username.toLowerCase().includes(q)) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && userStatus(u) !== statusFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    return Array.from(pages)
      .filter((p) => p >= 1 && p <= totalPages)
      .sort((a, b) => a - b);
  }, [totalPages, page]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setRoleFilter('all');
    setStatusFilter('all');
    setPage(1);
  };

  const handleToggleActive = async (u: SecurityUser) => {
    await updateUser(u.user_id, { is_active: !u.is_active });
    reload();
  };

  const handleUnlock = async (u: SecurityUser) => {
    await unlockUser(u.user_id);
    reload();
  };

  const handleExport = () => {
    const header = ['Username', 'Role', 'Registration No.', 'Status', 'Last Login'];
    const rows = filtered.map((u) => [u.username, ROLE_LABEL[u.role], u.registration_number ?? '', userStatus(u), u.last_login_at ?? '']);
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Users &amp; Roles</h1>
          <p>Home &gt; Users &amp; Roles</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => navigate('/reports?tab=operational')}>
            <ClipboardIcon /> Audit Log
          </button>
          <button className="pat-btn" onClick={handleExport}>
            <DownloadIcon /> Export Users
          </button>
          <button className="pat-btn primary" onClick={() => setShowAddUser(true)}>
            <PlusIcon /> Add New User
          </button>
        </div>
      </div>

      <div className="ur-tabs">
        <button className={`ur-tab${activeTab === 'users' ? ' active' : ''}`} onClick={() => setActiveTab('users')}>
          Users
        </button>
        <button className={`ur-tab${activeTab === 'roles' ? ' active' : ''}`} onClick={() => setActiveTab('roles')}>
          Roles
        </button>
      </div>

      {error && <div className="dash-error-banner">Couldn't load users: {error}</div>}

      <div className="ur-layout">
        <div style={{ minWidth: 0 }}>
          {activeTab === 'users' ? (
            <>
              <div className="pat-filter-bar">
                <div className="pat-search">
                  <SearchIcon />
                  <input placeholder="Search by name or username…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
                </div>

                <select className="pat-select" value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value as Role | 'all'); setPage(1); }}>
                  <option value="all">All Roles</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>

                <select className="pat-select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}>
                  <option value="all">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Locked">Locked</option>
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
                        <th>User</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading &&
                        Array.from({ length: 5 }).map((_, i) => (
                          <tr key={i}>
                            <td colSpan={6} className="pat-muted">
                              Loading…
                            </td>
                          </tr>
                        ))}

                      {!loading && pageRows.length === 0 && (
                        <tr>
                          <td colSpan={6}>
                            <div className="pat-empty">No users match these filters.</div>
                          </td>
                        </tr>
                      )}

                      {!loading &&
                        pageRows.map((u, i) => {
                          const status = userStatus(u);
                          return (
                            <tr key={u.user_id}>
                              <td className="pat-muted">{(page - 1) * PER_PAGE + i + 1}</td>
                              <td>
                                <div className="ur-user-cell">
                                  <div className="ur-avatar">{initials(u.username)}</div>
                                  <div>
                                    <button className="pat-id-link" style={{ display: 'block' }} onClick={() => setViewUser(u)}>
                                      {u.username}
                                    </button>
                                    <span className="ur-user-sub">{u.registration_number || `User #${u.user_id}`}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`badge ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                              </td>
                              <td>
                                <span className={`badge ${STATUS_BADGE[status]}`}>{status}</span>
                              </td>
                              <td>{u.last_login_at ? formatDateTime(u.last_login_at) : <span className="pat-muted">Never</span>}</td>
                              <td>
                                <div className="pat-actions-cell">
                                  <button className="pat-icon-btn" onClick={() => setViewUser(u)} aria-label="View">
                                    <EyeIcon />
                                  </button>
                                  <button className="pat-icon-btn" onClick={() => setEditUser(u)} aria-label="Edit">
                                    <EditIcon />
                                  </button>
                                  <RowMenu
                                    user={u}
                                    currentUserId={currentUser?.id}
                                    onResetPassword={() => setResetPasswordUser(u)}
                                    onUnlock={() => handleUnlock(u)}
                                    onToggleActive={() => handleToggleActive(u)}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {filtered.length > 0 && (
                  <div className="pat-pagination">
                    <div className="pat-pagination-info">
                      Showing {(page - 1) * PER_PAGE + 1} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} users
                    </div>
                    <div className="pat-pagination-pages">
                      <button className="pat-page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                        <ChevronLeftIcon />
                      </button>
                      {pageNumbers.map((p, i) => {
                        const prev = pageNumbers[i - 1];
                        const showEllipsis = prev !== undefined && p - prev > 1;
                        return (
                          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {showEllipsis && <span className="pat-page-ellipsis">…</span>}
                            <button className={`pat-page-btn${p === page ? ' active' : ''}`} onClick={() => setPage(p)}>
                              {p}
                            </button>
                          </span>
                        );
                      })}
                      <button className="pat-page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <RolesMatrixTab matrix={matrix ?? []} />
          )}
        </div>

        <RolePermissionsPanel users={users ?? []} matrix={matrix ?? []} selectedRole={selectedRole} onSelectRole={setSelectedRole} />
      </div>

      {showAddUser && (
        <UserFormModal
          onClose={() => setShowAddUser(false)}
          onSaved={() => {
            setShowAddUser(false);
            reload();
          }}
        />
      )}

      {editUser && (
        <UserFormModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            reload();
          }}
        />
      )}

      {viewUser && (
        <ViewUserModal
          user={viewUser}
          onClose={() => setViewUser(null)}
          onEdit={() => {
            setEditUser(viewUser);
            setViewUser(null);
          }}
        />
      )}

      {resetPasswordUser && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onSaved={() => {
            setResetPasswordUser(null);
            reload();
          }}
        />
      )}
    </div>
  );
};

export default UsersRoles;
