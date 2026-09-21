import { useState } from 'react';
import GeneralTab from './GeneralTab';
import MasterDataTab from './MasterDataTab';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../users/users.css';
import './settings.css';

// Backup & Restore tab is disabled after the migration to Supabase (Postgres) — the old
// implementation copied the local SQLite file directly and has no Postgres equivalent yet.
type SettingsTab = 'general' | 'masterData';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'masterData', label: 'Master Data' },
];

const Settings = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  return (
    <div>
      <div className="pat-header">
        <div>
          <h1>Settings</h1>
          <p>Home &gt; Settings</p>
        </div>
      </div>

      <div className="st-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`st-tab${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'masterData' && <MasterDataTab />}
    </div>
  );
};

export default Settings;
