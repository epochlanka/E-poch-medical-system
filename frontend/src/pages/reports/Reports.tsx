import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { getOverviewReport } from '../../lib/reports';
import { DownloadIcon, FilterIcon } from '../../components/layout/Icons';
import OverviewTab from './OverviewTab';
import ReportListTab from './ReportListTab';
import CustomReportModal from './CustomReportModal';
import { presetRange, rangeToApiParams } from './reportsUtils';
import type { DateRangeInput } from './reportsUtils';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import './reports.css';

export type ReportTab = 'overview' | 'patient' | 'financial' | 'pharmacy' | 'inventory' | 'operational';

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'patient', label: 'Patient Reports' },
  { key: 'financial', label: 'Financial Reports' },
  { key: 'pharmacy', label: 'Pharmacy Reports' },
  { key: 'inventory', label: 'Inventory Reports' },
  { key: 'operational', label: 'Operational Reports' },
];

const VALID_TABS: ReportTab[] = ['overview', 'patient', 'financial', 'pharmacy', 'inventory', 'operational'];

const Reports = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ReportTab | null;
  const [activeTab, setActiveTab] = useState<ReportTab>(tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview');
  const [dateRange, setDateRange] = useState<DateRangeInput>(presetRange('monthly'));
  const [fromInput, setFromInput] = useState(dateRange.from);
  const [toInput, setToInput] = useState(dateRange.to);
  const [showCustomReport, setShowCustomReport] = useState(false);

  const applyDateRange = () => setDateRange({ from: fromInput, to: toInput });

  const handlePreset = (preset: 'daily' | 'weekly' | 'monthly' | 'yearly') => {
    const r = presetRange(preset);
    setDateRange(r);
    setFromInput(r.from);
    setToInput(r.to);
    setActiveTab('overview');
  };

  const {
    data: overview,
    loading,
    error,
  } = useApiData(() => getOverviewReport(rangeToApiParams(dateRange)), [JSON.stringify(dateRange)]);

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Reports &amp; Analytics</h1>
          <p>Home &gt; Reports &amp; Analytics</p>
        </div>
        <div className="pat-header-actions">
          <div className="rp-daterange">
            <input type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
            <span>–</span>
            <input type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
          </div>
          <button className="pat-btn" onClick={applyDateRange}>
            <FilterIcon /> Filter
          </button>
          <button className="pat-btn primary" onClick={() => setShowCustomReport(true)}>
            <DownloadIcon /> Export Report
          </button>
        </div>
      </div>

      <div className="rp-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`rp-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' ? (
        <OverviewTab
          overview={overview}
          loading={loading}
          error={error}
          onPreset={handlePreset}
          onCustomReport={() => setShowCustomReport(true)}
          onNavigateTab={setActiveTab}
        />
      ) : (
        <ReportListTab tab={activeTab} dateRange={dateRange} />
      )}

      {showCustomReport && <CustomReportModal onClose={() => setShowCustomReport(false)} />}
    </div>
  );
};

export default Reports;
