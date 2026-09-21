import type { PermissionMatrixEntry } from '../../lib/security';
import { ROLES } from '../../lib/security';
import { CheckCircleIcon, XCircleIcon } from '../../components/layout/Icons';
import { ROLE_LABEL } from './usersRolesUtils';

const RolesMatrixTab = ({ matrix }: { matrix: PermissionMatrixEntry[] }) => {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">Permission Matrix</h3>
        <span className="card-subtitle">What each role can access, module by module</span>
      </div>
      <div className="ur-matrix-scroll">
        <table className="ur-matrix">
          <thead>
            <tr>
              <th>Module</th>
              <th>Action</th>
              {ROLES.map((r) => (
                <th key={r} style={{ textAlign: 'center' }}>
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((entry) => (
              <tr key={`${entry.module}-${entry.action}`}>
                <td className="ur-matrix-module">{entry.module}</td>
                <td className="ur-matrix-action">{entry.action}</td>
                {ROLES.map((r) => (
                  <td key={r} className="ur-matrix-check">
                    {entry.roles.includes(r) ? (
                      <span style={{ color: '#16a34a' }}>
                        <CheckCircleIcon />
                      </span>
                    ) : (
                      <span style={{ color: '#e2e8f0' }}>
                        <XCircleIcon />
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RolesMatrixTab;
