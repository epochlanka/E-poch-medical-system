import { useAuth } from '../../context/AuthContext';
import { useApiData } from '../../hooks/useApiData';
import { getOverview } from '../../lib/dashboard';
import { PatientsIcon, DollarIcon, CalendarIcon, PrescriptionIcon, PillIcon } from '../../components/layout/Icons';
import KpiCard from './KpiCard';
import AppointmentsToday from './AppointmentsToday';
import RevenueChart from './RevenueChart';
import RecentPrescriptions from './RecentPrescriptions';
import TopMedicines from './TopMedicines';
import StockAlerts from './StockAlerts';
import QuickActions from './QuickActions';
import './dashboard.css';

const formatCurrency = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

const Dashboard = () => {
  const { user } = useAuth();
  const { data: overview, loading, error } = useApiData(getOverview);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome back{user ? `, ${user.username}` : ''} — here's what's happening today.</p>
        </div>
        <div className="dash-date-chip">
          <CalendarIcon />
          {today}
        </div>
      </div>

      {error && <div className="dash-error-banner">Couldn't load dashboard data: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard
          icon={<PatientsIcon />}
          iconBg="#eaf1fe"
          iconColor="#2563eb"
          label="Today's Patients"
          value={String(overview?.todaysPatients ?? 0)}
          changePct={overview?.todaysPatientsChangePct}
          loading={loading}
        />
        <KpiCard
          icon={<DollarIcon />}
          iconBg="#dcfce7"
          iconColor="#16a34a"
          label="Today's Revenue"
          value={formatCurrency(overview?.revenueToday ?? 0)}
          changePct={overview?.revenueTodayChangePct}
          loading={loading}
        />
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#f3e8ff"
          iconColor="#7c3aed"
          label="Total Appointments"
          value={String(overview?.totalAppointmentsToday ?? 0)}
          changePct={overview?.totalAppointmentsTodayChangePct}
          loading={loading}
        />
        <KpiCard
          icon={<PrescriptionIcon />}
          iconBg="#fef3c7"
          iconColor="#b45309"
          label="Pending Prescriptions"
          value={String(overview?.pendingPrescriptions ?? 0)}
          loading={loading}
        />
        <KpiCard
          icon={<PillIcon />}
          iconBg="#fee2e2"
          iconColor="#dc2626"
          label="Low Stock Medicines"
          value={String(overview?.lowStockCount ?? 0)}
          loading={loading}
          footer={
            <a className="kpi-view-all" href="#stock-alerts">
              View all
            </a>
          }
        />
      </div>

      <div className="dash-row dash-row-3">
        <AppointmentsToday />
        <RevenueChart />
        <RecentPrescriptions />
      </div>

      <div className="dash-row dash-row-3">
        <TopMedicines />
        <StockAlerts />
        <QuickActions />
      </div>
    </div>
  );
};

export default Dashboard;
