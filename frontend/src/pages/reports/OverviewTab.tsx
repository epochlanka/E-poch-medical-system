import type { OverviewReport } from '../../lib/reports';
import { PatientsIcon, CalendarIcon, StethoscopeIcon, PrescriptionIcon, DollarIcon, PillIcon, ClipboardIcon } from '../../components/layout/Icons';
import KpiCard from '../dashboard/KpiCard';
import RevenueSection from './RevenueSection';
import PerformanceSection from './PerformanceSection';
import Sidebar from './Sidebar';
import { formatCurrency } from './reportsUtils';
import type { ReportTab } from './Reports';

interface OverviewTabProps {
  overview: OverviewReport | null;
  loading: boolean;
  error: string | null;
  onPreset: (preset: 'daily' | 'weekly' | 'monthly' | 'yearly') => void;
  onCustomReport: () => void;
  onNavigateTab: (tab: ReportTab) => void;
}

const OverviewTab = ({ overview, loading, error, onPreset, onCustomReport, onNavigateTab }: OverviewTabProps) => {
  const k = overview?.kpis;
  const s = overview?.stats;

  return (
    <div>
      {error && <div className="dash-error-banner">Couldn't load report data: {error}</div>}

      <div className="dash-kpi-row">
        <KpiCard icon={<PatientsIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="Total Patients" value={String(k?.totalPatients ?? 0)} changePct={k?.totalPatientsChangePct} compareLabel="previous period" loading={loading} />
        <KpiCard icon={<CalendarIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Appointments" value={String(k?.appointments ?? 0)} changePct={k?.appointmentsChangePct} compareLabel="previous period" loading={loading} />
        <KpiCard icon={<StethoscopeIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Consultations" value={String(k?.consultations ?? 0)} changePct={k?.consultationsChangePct} compareLabel="previous period" loading={loading} />
        <KpiCard icon={<PrescriptionIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Prescriptions" value={String(k?.prescriptions ?? 0)} changePct={k?.prescriptionsChangePct} compareLabel="previous period" loading={loading} />
        <KpiCard icon={<DollarIcon />} iconBg="#dbeafe" iconColor="#1d4ed8" label="Total Revenue" value={formatCurrency(k?.totalRevenue ?? 0)} changePct={k?.totalRevenueChangePct} compareLabel="previous period" loading={loading} />
      </div>

      <div className="rp-layout">
        <div style={{ minWidth: 0 }}>
          {overview && <RevenueSection overview={overview} />}

          <div className="dash-kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <KpiCard icon={<PatientsIcon />} iconBg="#eaf1fe" iconColor="#2563eb" label="New Patients" value={String(s?.newPatients ?? 0)} changePct={s?.newPatientsChangePct} compareLabel="previous period" loading={loading} />
            <KpiCard icon={<PillIcon />} iconBg="#dcfce7" iconColor="#16a34a" label="Medicine Sales" value={formatCurrency(s?.medicineSales ?? 0)} changePct={s?.medicineSalesChangePct} compareLabel="previous period" loading={loading} />
            <KpiCard icon={<ClipboardIcon />} iconBg="#fef3c7" iconColor="#b45309" label="Average Bill Value" value={formatCurrency(s?.avgBillValue ?? 0)} changePct={s?.avgBillValueChangePct} compareLabel="previous period" loading={loading} />
            <KpiCard icon={<DollarIcon />} iconBg="#f3e8ff" iconColor="#7c3aed" label="Collections" value={formatCurrency(s?.collections ?? 0)} changePct={s?.collectionsChangePct} compareLabel="previous period" loading={loading} />
          </div>

          {overview && <PerformanceSection overview={overview} />}
        </div>

        <Sidebar overview={overview} onPreset={onPreset} onCustomReport={onCustomReport} onNavigateTab={onNavigateTab} />
      </div>
    </div>
  );
};

export default OverviewTab;
