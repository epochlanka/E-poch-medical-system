import { REPORT_DEFINITIONS } from '../../lib/reports';
import ReportPanel from './ReportPanel';
import type { DateRangeInput } from './reportsUtils';
import type { ReportTab } from './Reports';

const ReportListTab = ({ tab, dateRange }: { tab: Exclude<ReportTab, 'overview'>; dateRange: DateRangeInput }) => {
  const defs = REPORT_DEFINITIONS.filter((d) => d.tab === tab);
  return (
    <div>
      {defs.map((def) => (
        <ReportPanel key={def.key} def={def} dateRange={dateRange} />
      ))}
    </div>
  );
};

export default ReportListTab;
