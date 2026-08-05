import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import {
  listAppointments,
  getAppointmentStats,
  getTodaysSchedule,
  updateAppointmentStatus,
  listDoctors,
} from '../../lib/appointments';
import type { AppointmentListStatus, ListAppointmentsParams, QueueAppointment } from '../../lib/appointments';
import {
  CalendarIcon,
  PlusIcon,
  SearchIcon,
  FilterIcon,
  RefreshIcon,
  EyeIcon,
  EditIcon,
  MoreVerticalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertIcon,
  ClipboardIcon,
  StethoscopeIcon,
  PrintIcon,
} from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import { initials } from '../patients/patientUtils';
import MonthCalendar from './MonthCalendar';
import NewAppointmentModal from './NewAppointmentModal';
import ViewAppointmentModal from './ViewAppointmentModal';
import RescheduleModal from './RescheduleModal';
import { formatDate, formatTime, appointmentCode, STATUS_BADGE } from './appointmentUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../pharmacy/pharmacy.css';
import './appointments.css';

const PER_PAGE_OPTIONS = [8, 20, 50, 100];

const TABS: { key: AppointmentListStatus | 'all' | 'today'; label: string }[] = [
  { key: 'all', label: 'All Appointments' },
  { key: 'today', label: 'Today' },
  { key: 'Upcoming', label: 'Upcoming' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'No Show', label: 'No Show' },
];

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

const RowMenu = ({ appointment, onCancel, onNoShow }: { appointment: QueueAppointment; onCancel: () => void; onNoShow: () => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));
  const isActive = ['Waiting', 'Called', 'Consulting'].includes(appointment.status);

  if (!isActive) return <span style={{ width: 30, display: 'inline-block' }} />;

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
              onNoShow();
            }}
          >
            Mark No Show
          </button>
          <button
            className="danger"
            onClick={() => {
              setOpen(false);
              onCancel();
            }}
          >
            Cancel Appointment
          </button>
        </div>
      )}
    </div>
  );
};

const Appointments = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState<ListAppointmentsParams>({ page: 1, limit: 8 });
  const [activeTab, setActiveTab] = useState<AppointmentListStatus | 'all' | 'today'>('all');
  const [doctorId, setDoctorId] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [viewAppointment, setViewAppointment] = useState<QueueAppointment | null>(null);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<QueueAppointment | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stats, loading: statsLoading, reload: reloadStats } = useApiData(getAppointmentStats);
  const { data: schedule, loading: scheduleLoading, reload: reloadSchedule } = useApiData(getTodaysSchedule);
  const { data: result, loading, error, reload } = useApiData(() => listAppointments(filters), [JSON.stringify(filters)]);
  const { data: doctors } = useApiData(() => listDoctors());

  const appointments = result?.data ?? [];
  const pagination = result?.pagination;

  const refreshAll = () => {
    reload();
    reloadStats();
    reloadSchedule();
  };

  const setTab = (key: AppointmentListStatus | 'all' | 'today') => {
    setActiveTab(key);
    if (key === 'all') {
      setDateFilter('');
      setFilters((f) => ({ ...f, status: undefined, date: undefined, page: 1 }));
    } else if (key === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      setDateFilter(today);
      setFilters((f) => ({ ...f, status: undefined, date: today, page: 1 }));
    } else {
      setFilters((f) => ({ ...f, status: key, page: 1 }));
    }
  };

  const setDoctorFilter = (value: string) => {
    setDoctorId(value);
    setFilters((f) => ({ ...f, doctorId: value ? Number(value) : undefined, page: 1 }));
  };

  const setDateOnly = (value: string) => {
    setDateFilter(value);
    setFilters((f) => ({ ...f, date: value || undefined, page: 1 }));
  };

  const resetFilters = () => {
    setSearchInput('');
    setDoctorId('');
    setDateFilter('');
    setActiveTab('all');
    setFilters({ page: 1, limit: filters.limit });
  };

  const goToPage = (page: number) => setFilters((f) => ({ ...f, page }));

  const handleCancel = async (appointmentId: number) => {
    await updateAppointmentStatus(appointmentId, 'Cancelled');
    refreshAll();
  };
  const handleNoShow = async (appointmentId: number) => {
    await updateAppointmentStatus(appointmentId, 'No Show');
    refreshAll();
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
      <div className="pat-header apt-no-print">
        <div>
          <h1>Appointments</h1>
          <p>Home &gt; Appointments</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewAppointment(true)}>
            <PlusIcon /> New Appointment
          </button>
        </div>
      </div>

      {error && <div className="dash-error-banner apt-no-print">Couldn't load appointments: {error}</div>}

      <div className="dash-kpi-row apt-no-print">
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Today's Appointments"
          value={String(stats?.todaysAppointments ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setTab('today')}>
              View today's list
            </span>
          }
        />
        <KpiCard
          icon={<PlusIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Upcoming (This Week)"
          value={String(stats?.upcomingThisWeek ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setTab('Upcoming')}>
              View this week
            </span>
          }
        />
        <KpiCard
          icon={<CheckCircleIcon />}
          iconBg="#ede9fe"
          iconColor="#7c3aed"
          label="Completed (This Week)"
          value={String(stats?.completedThisWeek ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setTab('Completed')}>
              View completed
            </span>
          }
        />
        <KpiCard
          icon={<XCircleIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Cancelled (This Week)"
          value={String(stats?.cancelledThisWeek ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setTab('Cancelled')}>
              View cancelled
            </span>
          }
        />
        <KpiCard
          icon={<AlertIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="No Show (This Week)"
          value={String(stats?.noShowThisWeek ?? 0)}
          loading={statsLoading}
          footer={
            <span className="kpi-view-all" style={{ cursor: 'pointer' }} onClick={() => setTab('No Show')}>
              View no show
            </span>
          }
        />
      </div>

      <div className="ph-tabs apt-no-print">
        {TABS.map((t) => (
          <button key={t.key} className={`ph-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="pat-filter-bar apt-no-print">
        <div className="pat-search">
          <SearchIcon />
          <input placeholder="Search by patient name, phone, or ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>

        <select className="pat-select" value={doctorId} onChange={(e) => setDoctorFilter(e.target.value)}>
          <option value="">All Doctors</option>
          {(doctors ?? []).map((d) => (
            <option key={d.user_id} value={d.user_id}>
              Dr. {d.username}
            </option>
          ))}
        </select>

        <input type="date" className="pat-select" value={dateFilter} onChange={(e) => setDateOnly(e.target.value)} />

        <button className="pat-btn" onClick={reload}>
          <FilterIcon /> Filter
        </button>
        <button className="pat-btn" onClick={resetFilters}>
          <RefreshIcon /> Reset
        </button>
      </div>

      <div className="ph-layout">
        <div className="pat-table-card">
          <div className="pat-table-scroll">
            <table className="pat-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Appointment ID</th>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date &amp; Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="apt-no-print">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="pat-muted">
                        Loading…
                      </td>
                    </tr>
                  ))}

                {!loading && appointments.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="pat-empty">No appointments match these filters.</div>
                    </td>
                  </tr>
                )}

                {!loading &&
                  appointments.map((a, i) => (
                    <tr key={a.appointment_id}>
                      <td className="pat-muted">{((pagination?.page ?? 1) - 1) * (pagination?.limit ?? 8) + i + 1}</td>
                      <td>
                        <button className="pat-id-link" onClick={() => setViewAppointment(a)}>
                          {appointmentCode(a.appointment_id, a.scheduled_at)}
                        </button>
                      </td>
                      <td>
                        <div className="pat-name-cell">
                          <div className="pat-avatar">{initials(a.patient.full_name)}</div>
                          <div>
                            <div className="pat-name">{a.patient.full_name}</div>
                            <div className="pat-muted" style={{ fontSize: 11.5 }}>
                              {a.patient.phone || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="pat-name-cell">
                          <div className="pat-avatar">{initials(a.doctor.username)}</div>
                          <div>
                            <div className="pat-name">Dr. {a.doctor.username}</div>
                            {a.doctor.registration_number && (
                              <div className="pat-muted" style={{ fontSize: 11.5 }}>
                                {a.doctor.registration_number}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {formatDate(a.scheduled_at)}
                        <div className="pat-muted" style={{ fontSize: 11.5 }}>
                          {formatTime(a.scheduled_at)}
                        </div>
                      </td>
                      <td>{a.reason || <span className="pat-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                      </td>
                      <td className="apt-no-print">
                        <div className="pat-actions-cell">
                          <button className="pat-icon-btn" onClick={() => setViewAppointment(a)} aria-label="View">
                            <EyeIcon />
                          </button>
                          {['Waiting', 'Called'].includes(a.status) && (
                            <button className="pat-icon-btn" onClick={() => setRescheduleAppointment(a)} aria-label="Reschedule">
                              <EditIcon />
                            </button>
                          )}
                          <RowMenu appointment={a} onCancel={() => handleCancel(a.appointment_id)} onNoShow={() => handleNoShow(a.appointment_id)} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {pagination && pagination.total > 0 && (
            <div className="pat-pagination apt-no-print">
              <div className="pat-pagination-info">
                Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} appointments
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

              <select className="pat-select" value={filters.limit} onChange={(e) => setFilters((f) => ({ ...f, limit: Number(e.target.value), page: 1 }))}>
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} per page
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="apt-no-print" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Calendar</h3>
            </div>
            <MonthCalendar selectedDate={dateFilter || null} onSelectDate={(d) => setDateOnly(d ?? '')} />
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Today's Schedule</h3>
              <button className="card-link" onClick={() => setTab('today')}>
                View All
              </button>
            </div>
            {scheduleLoading && <div className="card-empty">Loading…</div>}
            {schedule?.map((block) => (
              <div className="apt-schedule-row" key={block.label}>
                <span>{block.label}</span>
                <span className="badge badge-blue">{block.count} Appointments</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="qa-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className="qa-btn" onClick={() => setShowNewAppointment(true)}>
                <div className="qa-icon" style={{ background: '#eaf1fe', color: '#2563eb' }}>
                  <PlusIcon />
                </div>
                <span className="qa-label">New Appointment</span>
              </button>
              <button className="qa-btn" onClick={resetFilters}>
                <div className="qa-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <ClipboardIcon />
                </div>
                <span className="qa-label">Appointment List</span>
              </button>
              <button className="qa-btn" onClick={() => navigate('/queue')}>
                <div className="qa-icon" style={{ background: '#ede9fe', color: '#7c3aed' }}>
                  <StethoscopeIcon />
                </div>
                <span className="qa-label">Live Queue</span>
              </button>
              <button className="qa-btn" onClick={() => window.print()}>
                <div className="qa-icon" style={{ background: '#fef3c7', color: '#b45309' }}>
                  <PrintIcon />
                </div>
                <span className="qa-label">Print Schedule</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNewAppointment && (
        <NewAppointmentModal
          onClose={() => setShowNewAppointment(false)}
          onSuccess={() => {
            setShowNewAppointment(false);
            refreshAll();
          }}
        />
      )}

      {viewAppointment && <ViewAppointmentModal appointment={viewAppointment} onClose={() => setViewAppointment(null)} />}

      {rescheduleAppointment && (
        <RescheduleModal
          appointment={rescheduleAppointment}
          onClose={() => setRescheduleAppointment(null)}
          onSaved={() => {
            setRescheduleAppointment(null);
            refreshAll();
          }}
        />
      )}
    </div>
  );
};

export default Appointments;
