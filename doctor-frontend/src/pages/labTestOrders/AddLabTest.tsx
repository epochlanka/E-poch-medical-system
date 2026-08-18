import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listConsultations } from '../../lib/consultations';
import { getLabTestOrderContext, createLabTestOrder, printLabTestOrder } from '../../lib/labTestOrders';
import type { LabTestOrderPriority } from '../../lib/labTestOrders';
import { calculateAge } from '../../lib/queue';
import { PlusIcon, SendIcon, CheckCircleIcon, ClipboardIcon, PrintIcon, TrashIcon } from '../../components/layout/Icons';
import '../dashboard/dashboard.css';
import '../../styles/shared.css';
import '../queue/queue.css';
import '../consultations/consultation.css';
import '../prescriptions/prescriptions.css';

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const labTestOrderCode = (id: number) => `LAB${String(id).padStart(6, '0')}`;

const CATEGORY_OPTIONS = ['Hematology', 'Biochemistry', 'Microbiology', 'Radiology', 'Serology', 'Pathology', 'Cardiology', 'Endocrinology'];
const PRIORITY_OPTIONS: LabTestOrderPriority[] = ['Routine', 'Urgent', 'STAT'];

interface DraftTest {
  key: string;
  test_name: string;
  test_category: string;
  instructions: string;
  priority: LabTestOrderPriority;
  additional_notes: string;
}

const emptyDraft = (): DraftTest => ({ key: `${Date.now()}-${Math.random()}`, test_name: '', test_category: '', instructions: '', priority: 'Routine', additional_notes: '' });

// Landing view when no consultation is specified — mirrors NewPrescription's PrescriptionPicker.
const AddLabTestPicker = () => {
  const navigate = useNavigate();
  const { data: result, loading } = useApiData(() => listConsultations({ status: 'Draft', limit: 50 }));
  const drafts = result?.data ?? [];

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;

  if (drafts.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <ClipboardIcon />
        <h3 style={{ margin: '12px 0 4px', color: '#334155' }}>No in-progress consultation to order tests for</h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px' }}>Start or resume a consultation first, then add a lab test from there.</p>
        <button className="pat-btn primary" onClick={() => navigate('/queue/call-next')}>
          Go to Call Next
        </button>
      </div>
    );
  }

  return (
    <div className="pat-table-card">
      <div className="pat-header" style={{ padding: '16px 18px 0', border: 'none' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>Choose a consultation to add a lab test for</h3>
      </div>
      <div className="pat-table-scroll">
        <table className="pat-table">
          <thead>
            <tr>
              <th>Patient</th>
              <th>Date</th>
              <th>Diagnosis</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((c) => (
              <tr key={c.consultationId}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.patientName}</div>
                  <span className="pat-muted" style={{ fontSize: 11.5 }}>
                    {c.patientId}
                  </span>
                </td>
                <td>{formatDate(c.createdAt)}</td>
                <td>{c.diagnosis || '—'}</td>
                <td>
                  <button className="pat-btn primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => navigate(`/lab-orders/new/${c.consultationId}`)}>
                    Add Lab Test
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AddLabTest = () => {
  const { consultationId } = useParams();
  if (!consultationId) return <AddLabTestPicker />;
  return <Builder consultationId={Number(consultationId)} />;
};

const Builder = ({ consultationId }: { consultationId: number }) => {
  const navigate = useNavigate();
  const { data: context, loading, error } = useApiData(() => getLabTestOrderContext(consultationId), [consultationId]);

  const [drafts, setDrafts] = useState<DraftTest[]>([emptyDraft()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ id: number; code: string; testName: string }[] | null>(null);

  const updateDraft = (key: string, field: keyof DraftTest) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, [field]: e.target.value } : d)));

  const addDraftRow = () => setDrafts((prev) => [...prev, emptyDraft()]);
  const removeDraftRow = (key: string) => setDrafts((prev) => (prev.length > 1 ? prev.filter((d) => d.key !== key) : prev));

  const submit = async () => {
    const valid = drafts.filter((d) => d.test_name.trim());
    if (valid.length === 0) {
      setSubmitError('Enter at least one test name before submitting.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = [];
      for (const d of valid) {
        const res = await createLabTestOrder({
          consultation_id: consultationId,
          test_name: d.test_name.trim(),
          test_category: d.test_category.trim() || undefined,
          instructions: d.instructions.trim() || undefined,
          priority: d.priority,
          additional_notes: d.additional_notes.trim() || undefined,
        });
        created.push({ id: res.data.lab_test_order_id, code: labTestOrderCode(res.data.lab_test_order_id), testName: res.data.test_name });
      }
      setSubmitted(created);
    } catch (err: any) {
      setSubmitError(err.response?.data?.message || 'Failed to submit lab test order.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p style={{ padding: 24, color: '#64748b' }}>Loading…</p>;
  if (error || !context) return <div className="dash-error-banner">Couldn't load this consultation: {error}</div>;

  const { patient } = context.appointment;

  if (submitted) {
    return (
      <div>
        <div className="card rxp-success" style={{ maxWidth: 560, margin: '40px auto' }}>
          <div className="rxp-success-icon">
            <CheckCircleIcon />
          </div>
          <h2 style={{ margin: '0 0 6px', color: '#0f172a' }}>Lab Test{submitted.length > 1 ? 's' : ''} Ordered</h2>
          <p style={{ color: '#64748b', fontSize: 13.5, margin: '0 0 16px' }}>
            {submitted.length} test{submitted.length > 1 ? 's' : ''} ordered for {patient.full_name}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {submitted.map((o) => (
              <div key={o.id} className="cons-rx-row">
                <span>
                  {o.code} — {o.testName}
                </span>
                <button className="pat-btn" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => printLabTestOrder(o.id)}>
                  <PrintIcon /> Print Request
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="cons-btn primary" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
              Back to Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="dash-header">
        <div>
          <h1>Add Lab Test</h1>
          <p>Order laboratory tests for this consultation.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="pat-btn" onClick={() => navigate(`/consultations/workspace/${context.appointment.appointmentId}`)}>
            Cancel
          </button>
          <button className="pat-btn primary" onClick={submit} disabled={submitting}>
            <SendIcon /> {submitting ? 'Submitting…' : 'Submit Lab Test Order'}
          </button>
        </div>
      </div>

      {submitError && <div className="dash-error-banner">{submitError}</div>}

      <div className="cons-box" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {patient.photo_url ? (
            <img className="cons-banner-avatar" src={fileUrl(patient.photo_url)} alt={patient.full_name} />
          ) : (
            <div className="cons-banner-avatar">{initials(patient.full_name)}</div>
          )}
          <div>
            <div className="cons-banner-name">{patient.full_name}</div>
            <div className="cons-banner-meta">
              MRN: {patient.patient_id} · {calculateAge(patient.dob)} Y / {patient.gender}
            </div>
          </div>
        </div>

        <div className="rxp-field-grid">
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Visit Date &amp; Time</div>
            <div className="rxp-field-box-value">{formatDateTime(context.appointment.scheduledAt)}</div>
          </div>
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Diagnosis</div>
            <div className="rxp-field-box-value">{context.consultation.diagnosis || '—'}</div>
          </div>
          <div className="rxp-field-box">
            <div className="rxp-field-box-label">Attending Doctor</div>
            <div className="rxp-field-box-value">Dr. {context.appointment.doctor.username}</div>
          </div>
        </div>
      </div>

      {drafts.map((d, i) => (
        <div className="cons-box" style={{ marginBottom: 16 }} key={d.key}>
          <div className="cons-box-title">
            Test {i + 1}
            {drafts.length > 1 && (
              <button className="pat-icon-btn" onClick={() => removeDraftRow(d.key)} aria-label="Remove test">
                <TrashIcon />
              </button>
            )}
          </div>
          <div className="cons-main">
            <div className="cons-box" style={{ border: 'none', padding: 0 }}>
              <div className="cons-box-title">Test Name *</div>
              <input className="cons-input" value={d.test_name} onChange={updateDraft(d.key, 'test_name')} placeholder="e.g. Complete Blood Count" />
            </div>
            <div className="cons-box" style={{ border: 'none', padding: 0 }}>
              <div className="cons-box-title">Test Category</div>
              <input className="cons-input" list="lab-category-options" value={d.test_category} onChange={updateDraft(d.key, 'test_category')} placeholder="e.g. Hematology" />
            </div>
            <div className="cons-box span-2" style={{ border: 'none', padding: 0 }}>
              <div className="cons-box-title">Instructions</div>
              <input className="cons-input" value={d.instructions} onChange={updateDraft(d.key, 'instructions')} placeholder="e.g. Fasting sample required" />
            </div>
            <div className="cons-box" style={{ border: 'none', padding: 0 }}>
              <div className="cons-box-title">Priority</div>
              <select className="cons-select" value={d.priority} onChange={updateDraft(d.key, 'priority')}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="cons-box span-2" style={{ border: 'none', padding: 0 }}>
              <div className="cons-box-title">Additional Notes</div>
              <textarea className="cons-textarea" rows={2} value={d.additional_notes} onChange={updateDraft(d.key, 'additional_notes')} placeholder="Any other notes for the lab" />
            </div>
          </div>
        </div>
      ))}

      <datalist id="lab-category-options">
        {CATEGORY_OPTIONS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <button type="button" className="pat-btn" style={{ fontSize: 12.5, padding: '7px 12px' }} onClick={addDraftRow}>
        <PlusIcon /> Add Another Test
      </button>
    </div>
  );
};

export default AddLabTest;
