import { useEffect, useMemo, useState } from 'react';
import { useApiData } from '../../hooks/useApiData';
import { fileUrl } from '../../lib/api';
import { listPatients } from '../../lib/patients';
import type { Patient } from '../../lib/patients';
import { getFamily } from '../../lib/families';
import { listInvoices } from '../../lib/billing';
import type { Invoice, InvoicePayment } from '../../lib/billing';
import {
  InvoiceIcon,
  SearchIcon,
  PrintIcon,
  DownloadIcon,
  PlusIcon,
  DollarIcon,
  ChevronRightIcon,
  UserPlusIcon,
} from '../../components/layout/Icons';
import { initials, calculateAge } from '../patients/patientUtils';
import { formatDateTime, formatCurrency, invoiceCode, paymentStatusLabel, STATUS_BADGE } from './billingUtils';
import NewInvoiceModal from './NewInvoiceModal';
import RecordPaymentModal from './RecordPaymentModal';
import '../../styles/shared.css';
import '../dashboard/dashboard.css';
import '../patients/register.css';
import '../appointments/bookAppointment.css';
import './consolidatedInvoice.css';

const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const ITEM_TYPE_LABEL: Record<string, string> = { ConsultationFee: 'Consultation Fee', Medicine: 'Medicine', Discount: 'Discount' };

const ConsolidatedInvoice = () => {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);

  const [dateFrom, setDateFrom] = useState(isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(isoDaysAgo(0));

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);

  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      listPatients({ search: searchInput, status: 'active', limit: 8 })
        .then((res) => setSearchResults(res.data))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: family } = useApiData(() => (patient ? getFamily(patient.family_id) : Promise.resolve(null)), [patient?.family_id]);

  const {
    data: invoiceResult,
    loading: invoicesLoading,
    reload: reloadInvoices,
  } = useApiData(
    () =>
      patient
        ? listInvoices({ patientId: patient.patient_id, from: new Date(dateFrom).toISOString(), to: new Date(new Date(dateTo).setHours(23, 59, 59, 999)).toISOString(), limit: 100 })
        : Promise.resolve(null),
    [patient?.patient_id, dateFrom, dateTo]
  );

  const invoices = useMemo(() => (invoiceResult?.data ?? []).slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [invoiceResult]);

  useEffect(() => {
    setExpanded(new Set(invoices.map((i) => i.invoice_id)));
  }, [invoices.length, patient?.patient_id]);

  const activeInvoices = invoices.filter((i) => i.payment_status !== 'Voided');
  const voidedCount = invoices.length - activeInvoices.length;

  const summary = {
    totalVisits: invoices.length,
    subTotal: activeInvoices.reduce((s, i) => s + i.subtotal, 0),
    discountTotal: activeInvoices.reduce((s, i) => s + i.discount_total, 0),
    totalAmount: activeInvoices.reduce((s, i) => s + i.total_amount, 0),
    paidAmount: activeInvoices.reduce((s, i) => s + i.paid_amount, 0),
  };
  const balance = Math.max(0, summary.totalAmount - summary.paidAmount);

  const aggregateStatus = activeInvoices.length === 0 ? null : balance <= 0.01 ? 'Paid' : summary.paidAmount > 0 ? 'Partially Paid' : 'Unpaid';

  const allPayments = useMemo(
    () =>
      invoices
        .flatMap((inv) => inv.payments.map((p) => ({ ...p, invoiceId: inv.invoice_id })))
        .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()),
    [invoices]
  );
  const lastPayment: (InvoicePayment & { invoiceId: number }) | undefined = allPayments[0];

  const toggleExpand = (id: number) => setExpanded((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));
  const expandAll = () => setExpanded(new Set(invoices.map((i) => i.invoice_id)));
  const collapseAll = () => setExpanded(new Set());

  const selectPatient = (p: Patient) => {
    setPatient(p);
    setSearchInput('');
    setSearchResults([]);
  };

  if (!patient) {
    return (
      <div>
        <div className="pat-header">
          <div>
            <h1>
              <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
                <InvoiceIcon />
              </span>
              Consolidated Invoice
            </h1>
            <p>View, print or share the consolidated invoice for the selected patient.</p>
          </div>
        </div>

        <div className="card" style={{ maxWidth: 560, margin: '20px auto' }}>
          <div className="reg-card-header">
            <span className="reg-card-icon">
              <SearchIcon />
            </span>
            <span className="reg-card-title">Select a Patient</span>
          </div>
          <div className="pat-search">
            <SearchIcon />
            <input placeholder="Search by name, NIC, phone or Patient ID…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          {searchInput.trim().length >= 2 && (
            <div className="bk-search-results" style={{ marginTop: 8 }}>
              {searching && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>Searching…</div>}
              {!searching && searchResults.length === 0 && <div style={{ padding: 12, fontSize: 13, color: '#94a3b8' }}>No patients found.</div>}
              {!searching &&
                searchResults.map((p) => (
                  <div className="bk-search-row" key={p.patient_id} onClick={() => selectPatient(p)}>
                    {p.photo_url ? <img className="pat-avatar" src={fileUrl(p.photo_url)} alt="" /> : <div className="pat-avatar">{initials(p.full_name)}</div>}
                    <div>
                      <div className="pat-name">{p.full_name}</div>
                      <span className="pat-muted" style={{ fontSize: 11.5 }}>
                        {p.patient_id} · {p.nic || 'No NIC'}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="pat-header ci-no-print">
        <div>
          <h1>
            <span style={{ marginRight: 8, color: '#2563eb', verticalAlign: -2, display: 'inline-flex' }}>
              <InvoiceIcon />
            </span>
            Consolidated Invoice
          </h1>
          <p>View, print or share the consolidated invoice for the selected patient.</p>
        </div>
        <div className="pat-header-actions">
          <button className="pat-btn" onClick={() => setPatient(null)}>
            Change Patient
          </button>
        </div>
      </div>

      <div className="ci-print-title">Consolidated Invoice — {patient.full_name}</div>

      <div className="ci-patient-card">
        <div className="ci-patient-left">
          {patient.photo_url ? <img className="pat-avatar" style={{ width: 52, height: 52 }} src={fileUrl(patient.photo_url)} alt="" /> : <div className="pat-avatar" style={{ width: 52, height: 52, fontSize: 16 }}>{initials(patient.full_name)}</div>}
          <div>
            <div className="ci-patient-name">
              {patient.full_name} <span className="badge badge-blue">{patient.patient_id}</span>
            </div>
            <div className="ci-patient-sub">
              {calculateAge(patient.dob)} Y | {patient.gender} | {patient.phone || 'No phone'}
            </div>
            {family?.address && <div className="ci-patient-address">Address: {family.address}{family.city ? `, ${family.city}` : ''}</div>}
          </div>
        </div>
        {aggregateStatus && <span className={`badge ${STATUS_BADGE[aggregateStatus]}`} style={{ fontSize: 13, padding: '6px 14px' }}>{aggregateStatus}</span>}
      </div>

      <div className="ci-filter-row ci-no-print">
        <div className="modal-field">
          <label>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="modal-field">
          <label>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="ci-filter-actions">
          <button className="pat-btn" onClick={expandAll}>
            Expand All
          </button>
          <button className="pat-btn" onClick={collapseAll}>
            Collapse All
          </button>
          <button className="pat-btn" onClick={() => window.print()}>
            <PrintIcon /> Print
          </button>
          <button className="pat-btn" onClick={() => window.print()}>
            <DownloadIcon /> Download PDF
          </button>
          <button className="pat-btn primary" onClick={() => setShowNewInvoice(true)}>
            <PlusIcon /> New Invoice
          </button>
        </div>
      </div>

      <div className="bk-layout">
        <div>
          {invoicesLoading && <div className="ci-empty">Loading invoices…</div>}
          {!invoicesLoading && invoices.length === 0 && <div className="ci-empty">No invoices for this patient in the selected date range.</div>}

          {!invoicesLoading &&
            invoices.map((inv) => {
              const isOpen = expanded.has(inv.invoice_id);
              const ctx = inv.consultation?.appointment;
              const chargeItems = inv.items.filter((i) => i.item_type !== 'Discount');
              const discountItems = inv.items.filter((i) => i.item_type === 'Discount');
              const invBalance = Math.max(0, inv.total_amount - inv.paid_amount);
              return (
                <div className="ci-visit-card" key={inv.invoice_id}>
                  <div className="ci-visit-header" onClick={() => toggleExpand(inv.invoice_id)}>
                    <div className="ci-visit-header-left">
                      <span className={`ci-visit-chevron${isOpen ? ' open' : ''}`}>
                        <ChevronRightIcon />
                      </span>
                      <strong>{formatDateTime(inv.created_at)}</strong>
                      <span className="badge badge-blue">{invoiceCode(inv.invoice_id, inv.created_at)}</span>
                      <span>{ctx?.consultation_type || inv.type}</span>
                      {ctx && <span className="pat-muted">Dr. {ctx.doctor.username}</span>}
                      <span className={`badge ${STATUS_BADGE[inv.payment_status === 'Outstanding' ? 'Unpaid' : paymentStatusLabel(inv.payment_status)]}`}>
                        {paymentStatusLabel(inv.payment_status)}
                      </span>
                    </div>
                    <span className="ci-visit-total">{formatCurrency(inv.total_amount)}</span>
                  </div>

                  {isOpen && (
                    <div className="ci-visit-body">
                      <div className="pat-table-scroll">
                        <table className="pat-table">
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Type</th>
                              <th>Qty</th>
                              <th>Unit Price (LKR)</th>
                              <th>Amount (LKR)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chargeItems.map((item) => (
                              <tr key={item.invoice_item_id}>
                                <td>{item.description}</td>
                                <td>{ITEM_TYPE_LABEL[item.item_type] ?? item.item_type}</td>
                                <td>{item.qty}</td>
                                <td>{item.unit_price.toFixed(2)}</td>
                                <td>{item.line_total.toFixed(2)}</td>
                              </tr>
                            ))}
                            {discountItems.map((item) => (
                              <tr key={item.invoice_item_id}>
                                <td colSpan={4} style={{ color: '#dc2626' }}>
                                  Discount — {item.description}
                                </td>
                                <td style={{ color: '#dc2626' }}>{item.line_total.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {inv.payment_status === 'Voided' && inv.void_reason && (
                        <div className="dash-error-banner" style={{ marginTop: 10 }}>
                          Voided — {inv.void_reason}
                        </div>
                      )}
                    </div>
                  )}

                  {inv.payment_status !== 'Voided' && inv.payment_status !== 'Paid' && (
                    <div className="ci-visit-footer ci-no-print">
                      <span className="pat-muted" style={{ fontSize: 12 }}>
                        Balance due: {formatCurrency(invBalance)}
                      </span>
                      <button className="pat-btn primary" style={{ fontSize: 12.5, padding: '7px 12px' }} onClick={() => setPaymentTarget(inv)}>
                        <DollarIcon /> Record Payment
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Invoice Summary</h3>
            </div>
            <div className="ci-summary-row">
              <span>Total Visits</span>
              <span>{summary.totalVisits}</span>
            </div>
            <div className="ci-summary-row">
              <span>Sub Total</span>
              <span>{formatCurrency(summary.subTotal)}</span>
            </div>
            {summary.discountTotal > 0 && (
              <div className="ci-summary-row discount">
                <span>Discount</span>
                <span>- {formatCurrency(summary.discountTotal)}</span>
              </div>
            )}
            <div className="ci-summary-row total">
              <span>Total Amount</span>
              <span>{formatCurrency(summary.totalAmount)}</span>
            </div>
            <div className="ci-summary-row">
              <span>Amount Paid</span>
              <span>{formatCurrency(summary.paidAmount)}</span>
            </div>
            <div className={`ci-summary-row balance${balance > 0.01 ? ' due' : ''}`}>
              <span>Balance</span>
              <span>{formatCurrency(balance)}</span>
            </div>
            {voidedCount > 0 && (
              <div className="ci-summary-row">
                <span className="pat-muted">Voided invoices (excluded above)</span>
                <span className="pat-muted">{voidedCount}</span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Payment Information</h3>
            </div>
            {!lastPayment && <div className="pat-muted" style={{ fontSize: 12.5 }}>No payments recorded yet in this range.</div>}
            {lastPayment && (
              <>
                <div className="ci-payment-row">
                  <span>Last Payment Method</span>
                  <span>{lastPayment.method}</span>
                </div>
                <div className="ci-payment-row">
                  <span>Paid Date &amp; Time</span>
                  <span>{formatDateTime(lastPayment.received_at)}</span>
                </div>
                <div className="ci-payment-row">
                  <span>Paid By</span>
                  <span>{lastPayment.receiver.username}</span>
                </div>
                <div className="ci-payment-row">
                  <span>Invoice</span>
                  <span>{invoiceCode(lastPayment.invoiceId, lastPayment.received_at)}</span>
                </div>
                {allPayments.length > 1 && <div className="ci-payment-sub">+ {allPayments.length - 1} more payment(s) in this range</div>}
              </>
            )}
          </div>

          <div className="card ci-no-print">
            <div className="card-header">
              <h3 className="card-title">Actions</h3>
            </div>
            <div className="ci-actions-grid">
              <button className="ci-action-btn" onClick={() => window.print()}>
                <PrintIcon /> Print Invoice
              </button>
              <button className="ci-action-btn" onClick={() => window.print()}>
                <DownloadIcon /> Download PDF
              </button>
              <button className="ci-action-btn" onClick={() => setShowNewInvoice(true)} style={{ gridColumn: 'span 2' }}>
                <UserPlusIcon /> New Invoice for This Patient
              </button>
            </div>
          </div>
        </div>
      </div>

      {showNewInvoice && (
        <NewInvoiceModal
          patientId={patient.patient_id}
          patientName={patient.full_name}
          onClose={() => setShowNewInvoice(false)}
          onSuccess={() => {
            setShowNewInvoice(false);
            reloadInvoices();
          }}
        />
      )}
      {paymentTarget && (
        <RecordPaymentModal
          invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null);
            reloadInvoices();
          }}
        />
      )}
    </div>
  );
};

export default ConsolidatedInvoice;
