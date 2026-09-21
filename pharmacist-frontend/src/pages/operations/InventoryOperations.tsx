import { useEffect, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { adjustStock, createStockCount, getBatches, getLedger, getStockAlerts, getStockCounts, postStockCount } from '../../lib/operations';
import type { Batch, LedgerEntry, StockAlert, StockCount } from '../../lib/operations';
import { Empty, Notice, PageHeader, Panel, PathLink } from './Shared';
import { dateText, errorText } from './format';

type Mode = 'batches' | 'stock-ledger' | 'low-stock' | 'expiry-alerts' | 'stock-take' | 'adjustment';
const titles: Record<Mode, [string, string]> = {
  batches: ['Batches & expiry', 'See how much medicine is in each delivery batch, where it is kept, and when it expires.'],
  'stock-ledger': ['Stock history', 'Choose a batch to see its most recent stock increases and decreases.'],
  'low-stock': ['Low stock', 'Medicines that may need ordering soon. Check usable batches before ordering.'],
  'expiry-alerts': ['Expiry alerts', 'Check these batches before giving medicine to a patient. Expired batches must not be used.'],
  'stock-take': ['Count stock', 'Compare the quantity on the shelf with the quantity in the system.'],
  adjustment: ['Correct stock', 'Record damaged, missing, or found stock. Every change needs a clear reason.'],
};
const tabs: [Mode, string][] = [['batches', 'Batches'], ['stock-ledger', 'History'], ['low-stock', 'Low stock'], ['expiry-alerts', 'Expiry'], ['stock-take', 'Count stock'], ['adjustment', 'Correct stock']];
const statusTone = (status: string) => status === 'Active' ? 'ok' : status === 'Expired' ? 'bad' : 'warn';

export default function InventoryOperations({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [counted, setCounted] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [delta, setDelta] = useState('');
  const [transactionType, setTransactionType] = useState<'Adjustment' | 'Transfer' | 'Return' | 'Damaged' | 'Expired'>('Adjustment');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);
  const medicineId = Number(params.get('medicineId')) || undefined;

  useEffect(() => { setPage(1); }, [search, medicineId]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const load = async () => {
      const [batchResult, alertResult, countResult] = await Promise.all([
        getBatches({ page, limit: 50, batchNo: search || undefined, medicineId }),
        getStockAlerts(), getStockCounts(),
      ]);
      if (!active) return;
      setBatches(batchResult.data); setTotalPages(batchResult.pagination.totalPages || 1);
      setAlerts(alertResult); setCounts(countResult);
    };
    load().catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, medicineId, revision]);

  useEffect(() => {
    if (!selectedId || mode !== 'stock-ledger') return;
    let active = true;
    getLedger(selectedId).then(r => { if (active) setLedger(r.data); }).catch(e => { if (active) setError(errorText(e)); });
    return () => { active = false; };
  }, [selectedId, mode, revision]);

  const selected = batches.find(b => b.batchId === selectedId);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); setSuccess(message); setRevision(n => n + 1); return true; }
    catch (e) { setError(errorText(e)); return false; }
    finally { setBusy(false); }
  };
  const submitAdjustment = () => {
    const amount = Number(delta);
    if (!selectedId || !Number.isInteger(amount) || amount === 0 || !reason.trim()) { setError('Choose a batch, enter a whole-number change, and write a reason.'); return; }
    if (selected && selected.qtyOnHand + amount < 0) { setError('This would make stock less than zero. Check the amount.'); return; }
    if (!window.confirm(`Change ${selected?.batchNo ?? 'this batch'} by ${amount > 0 ? '+' : ''}${amount} units? Reason: ${reason.trim()}`)) return;
    void run(() => adjustStock(selectedId, amount, reason.trim(), transactionType), 'Stock change saved with your reason.').then(ok => { if (ok) { setDelta(''); setReason(''); } });
  };
  const submitCount = () => {
    const items = Object.entries(counted).filter(([, value]) => value !== '').map(([id, value]) => ({ batch_id: Number(id), counted_qty: Number(value) }));
    if (items.length === 0 || items.some(i => !Number.isInteger(i.counted_qty) || i.counted_qty < 0)) { setError('Enter a whole-number count of zero or more for at least one batch.'); return; }
    if (!window.confirm(`Save a stock count for ${items.length} batch${items.length === 1 ? '' : 'es'}? Check the shelf quantities before continuing.`)) return;
    void run(() => createStockCount(items, notes.trim()), 'Stock count saved. It has not changed stock yet.').then(ok => { if (ok) { setCounted({}); setNotes(''); } });
  };
  const applyCount = (count: StockCount) => {
    if (!window.confirm(`Apply count #${count.stock_count_id} to stock? This changes the system balance. If stock moved after counting, the system will stop and ask for a new count.`)) return;
    void run(() => postStockCount(count.stock_count_id), 'Count applied to stock. The stock history has been updated.');
  };
  const showBatchTable = mode === 'batches' || mode === 'stock-ledger' || mode === 'stock-take' || mode === 'adjustment';
  const visibleAlerts = alerts.filter(a => mode === 'low-stock' ? a.type === 'low-stock' : a.type !== 'low-stock');

  return <div className="ops-page">
    <PageHeader title={titles[mode][0]} help={titles[mode][1]} action={<button className="ops-btn" onClick={() => setRevision(n => n + 1)} disabled={loading}>Refresh data</button>} />
    <nav className="ops-tabs" aria-label="Inventory pages">{tabs.map(([key, label]) => <NavLink key={key} to={`/inventory/${key}`} className={mode === key ? 'active' : ''}>{label}</NavLink>)}</nav>
    {error && <Notice tone="error">{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    {(mode === 'low-stock' || mode === 'expiry-alerts') && <>
      <div className="ops-stats"><div className="ops-stat"><span>Needs attention</span><strong>{visibleAlerts.length}</strong></div><div className="ops-stat"><span>Urgent</span><strong>{visibleAlerts.filter(a => a.severity === 'red').length}</strong></div></div>
      <Panel title={mode === 'low-stock' ? 'Medicines to check' : 'Batches to check'}>{loading ? <Empty text="Loading alerts…" /> : visibleAlerts.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Alert</th><th>Priority</th><th>Next step</th></tr></thead><tbody>{visibleAlerts.map((a, i) => <tr key={`${a.type}-${a.refId}-${i}`}><td><strong>{a.message}</strong></td><td><span className={`ops-pill ${a.severity === 'red' ? 'bad' : 'warn'}`}>{a.severity === 'red' ? 'Urgent' : 'Check soon'}</span></td><td><PathLink to={a.type === 'low-stock' ? `/inventory/batches?medicineId=${a.refId}` : '/inventory/batches'}>View batches</PathLink></td></tr>)}</tbody></table></div> : <Empty text="No alerts right now." />}</Panel>
    </>}
    {showBatchTable && <>
      {mode === 'stock-take' && <Notice tone="warn">Saving a count does not change stock. Small differences can be applied after review. Large differences need an administrator. If stock changed after counting, the system asks for a new count.</Notice>}
      {mode === 'adjustment' && <Notice tone="warn">Use this only for a real stock correction. Dispensing and goods receipt must use their own workflows.</Notice>}
      <Panel title={mode === 'stock-take' ? 'Enter shelf quantities' : 'Choose a batch'} action={<span className="ops-muted">Page {page} of {totalPages}</span>}>
        <div className="ops-toolbar"><input className="ops-search" aria-label="Search batch number" placeholder="Search batch number" value={search} onChange={e => setSearch(e.target.value)} />{medicineId && <PathLink to="/inventory/batches">Clear medicine filter</PathLink>}</div>
        {loading ? <Empty text="Loading batches…" /> : batches.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Medicine</th><th>Batch number</th><th>Expires</th><th>On shelf</th><th>Place</th><th>{mode === 'stock-take' ? 'Counted' : 'Action'}</th></tr></thead><tbody>{batches.map(b => <tr key={b.batchId}><td><strong>{b.medicineName}</strong><br /><span className={`ops-pill ${statusTone(b.status)}`}>{b.status}</span></td><td>{b.batchNo}</td><td>{dateText(b.expiryDate)}</td><td>{b.qtyOnHand}</td><td>{b.location || 'Not set'}</td><td>{mode === 'stock-take' ? <input className="ops-search" style={{ width: 95 }} aria-label={`Counted quantity for ${b.medicineName} batch ${b.batchNo}`} type="number" min="0" step="1" value={counted[b.batchId] ?? ''} onChange={e => setCounted(v => ({ ...v, [b.batchId]: e.target.value }))} /> : <button className="ops-btn" onClick={() => setSelectedId(b.batchId)}>{mode === 'stock-ledger' ? 'View history' : mode === 'adjustment' ? 'Correct stock' : 'View details'}</button>}</td></tr>)}</tbody></table></div> : <Empty text="No batches found. Try another search." />}
        <div className="ops-toolbar"><button className="ops-btn" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><button className="ops-btn" disabled={page >= totalPages} onClick={() => setPage(n => n + 1)}>Next</button></div>
      </Panel>
      {selected && mode === 'batches' && <Panel title={`${selected.medicineName} — ${selected.batchNo}`}><div className="ops-panel-body ops-grid"><div><strong>Expiry</strong><p>{dateText(selected.expiryDate)}</p></div><div><strong>Quantity</strong><p>{selected.qtyOnHand}</p></div><div><strong>Storage place</strong><p>{selected.location || 'Not set'}</p></div><div><strong>Supplier</strong><p>{selected.supplierName || 'Not recorded'}</p></div><PathLink to="/inventory/stock-ledger">See stock history</PathLink></div></Panel>}
      {selected && mode === 'stock-ledger' && <Panel title={`History — ${selected.medicineName}, batch ${selected.batchNo}`}>{ledger.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>When</th><th>What happened</th><th>Change</th><th>Balance</th><th>By</th></tr></thead><tbody>{ledger.map(e => <tr key={e.ledgerId}><td>{dateText(e.createdAt)}</td><td><strong>{e.eventType}</strong><br /><span className="ops-muted">{e.reason || '—'}</span></td><td>{e.changeQty > 0 ? '+' : ''}{e.changeQty}</td><td>{e.balanceAfter}</td><td>{e.createdBy}</td></tr>)}</tbody></table></div> : <Empty text="No movements recorded for this batch." />}</Panel>}
      {selected && mode === 'adjustment' && <Panel title={`Correct ${selected.medicineName} — ${selected.batchNo}`}><div className="ops-panel-body"><Notice>Current system quantity: <strong>{selected.qtyOnHand}</strong>. Use a negative number for missing or damaged stock, or a positive number for stock found.</Notice><div className="ops-grid"><div className="ops-field"><label htmlFor="stock-type">Type of change</label><select id="stock-type" value={transactionType} onChange={e => setTransactionType(e.target.value as typeof transactionType)}><option value="Adjustment">Adjustment (correction)</option><option value="Transfer">Transfer (moved elsewhere)</option><option value="Return">Return (sent back to supplier)</option><option value="Damaged">Damaged</option><option value="Expired">Expired / written off</option></select></div><div className="ops-field"><label htmlFor="stock-change">Change in quantity</label><input id="stock-change" type="number" step="1" value={delta} onChange={e => setDelta(e.target.value)} placeholder="Example: -2" /></div><div className="ops-field"><label htmlFor="stock-reason">Reason for change</label><input id="stock-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="Example: 2 tablets damaged" maxLength={200} /></div></div><div className="ops-actions"><button className="ops-btn primary" disabled={busy} onClick={submitAdjustment}>Review and save change</button></div></div></Panel>}
      {mode === 'stock-take' && <Panel title="Save this count"><div className="ops-panel-body"><div className="ops-field"><label htmlFor="count-notes">Notes (optional)</label><textarea id="count-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Example: Counted shelf A after closing" /></div><div className="ops-actions"><button className="ops-btn primary" disabled={busy} onClick={submitCount}>Save count for review</button></div></div></Panel>}
      {mode === 'stock-take' && <Panel title="Previous counts">{counts.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Date</th><th>Counted by</th><th>Batches</th><th>Status</th><th>Next step</th></tr></thead><tbody>{counts.map(c => <tr key={c.stock_count_id}><td>{dateText(c.created_at)}</td><td>{c.performed_by_user?.username || '—'}</td><td>{c.items.length}</td><td><span className={`ops-pill ${c.status === 'Posted' ? 'ok' : 'warn'}`}>{c.status === 'PendingReview' ? 'Needs admin review' : c.status === 'Posted' ? 'Applied' : 'Saved only'}</span></td><td>{c.status === 'Draft' ? <button className="ops-btn primary" disabled={busy} onClick={() => applyCount(c)}>Review and apply</button> : c.status === 'PendingReview' ? 'Ask administrator' : 'Complete'}</td></tr>)}</tbody></table></div> : <Empty text="No stock counts saved yet." />}</Panel>}
    </>}
  </div>;
}
