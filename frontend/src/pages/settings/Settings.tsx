import { useState } from 'react';
import GeneralTab from './GeneralTab';
import MasterDataTab from './MasterDataTab';
import BackupTab from './BackupTab';
import '../dashboard/dashboard.css';
import '../patients/patients.css';
import '../users/users.css';
import './settings.css';

type SettingsTab = 'general' | 'masterData' | 'backup';

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'masterData', label: 'Master Data' },
  { key: 'backup', label: 'Backup & Restore' },
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
      {activeTab === 'backup' && <BackupTab />}
    </div>
  );
};

export default Settings;
