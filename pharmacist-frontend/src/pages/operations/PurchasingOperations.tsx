import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { searchMedicines } from '../../lib/medicines';
import type { MedicineSearchResult } from '../../lib/medicines';
import { closeOrder, createOrder, getGrn, getGrns, getOrder, getOrders, getSuppliers, receiveOrder, submitOrder } from '../../lib/operations';
import type { Grn, GrnReceiptItem, PurchaseOrder, Supplier } from '../../lib/operations';

const RECEIVED_UNITS = ['Box', 'Strip', 'Bottle', 'Tablet', 'Capsule', 'ml', 'Tube', 'Piece', 'Other'];
import { Empty, Notice, PageHeader, Panel } from './Shared';
import { dateText, errorText, money } from './format';

type Mode = 'suppliers' | 'purchase-orders' | 'goods-received' | 'grn-review';
const titles: Record<Mode, [string, string]> = {
  suppliers: ['Suppliers', 'Find the company that supplies a medicine. Ask an administrator to add or change supplier details.'],
  'purchase-orders': ['Purchase orders', 'Order medicine from a supplier. Only a submitted order can receive a delivery.'],
  'goods-received': ['Receive a delivery', 'Check the medicine, quantity, batch number, and expiry before adding delivered stock.'],
  'grn-review': ['Delivery differences', 'See deliveries where received quantity differs from the order. An administrator reviews these differences.'],
};
const tabs: [Mode, string][] = [['suppliers', 'Suppliers'], ['purchase-orders', 'Orders'], ['goods-received', 'Receive delivery'], ['grn-review', 'Differences']];
type DraftLine = { medicine: MedicineSearchResult; qty: string; cost: string };
type ReceiptLine = { qty: string; batch: string; expiry: string; receivedUnit: string; unitsPerPack: string; sellingPricePerPack: string };
const emptyReceipt: ReceiptLine = { qty: '', batch: '', expiry: '', receivedUnit: 'Tablet', unitsPerPack: '1', sellingPricePerPack: '' };

export default function PurchasingOperations({ mode }: { mode: Mode }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<Grn[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [selectedGrn, setSelectedGrn] = useState<Grn | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [medicineSearch, setMedicineSearch] = useState('');
  const [medicineResults, setMedicineResults] = useState<MedicineSearchResult[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [receipt, setReceipt] = useState<Record<number, ReceiptLine>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => { setSelectedOrder(null); setSelectedGrn(null); }, [mode]);

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([getSuppliers(), getOrders({ limit: 100 }), getGrns()])
      .then(([s, o, g]) => { if (active) { setSuppliers(s); setOrders(o.data); setGrns(g); } })
      .catch(e => { if (active) setError(errorText(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); setSuccess('');
    try { await action(); setSelectedOrder(null); setSuccess(message); setRevision(n => n + 1); return true; }
    catch (e) { setError(errorText(e)); return false; }
    finally { setBusy(false); }
  };
  const searchForMedicine = async () => {
    if (!medicineSearch.trim()) { setMedicineResults([]); return; }
    try { setMedicineResults((await searchMedicines(medicineSearch.trim())).filter(m => m.is_active)); }
    catch (e) { setError(errorText(e)); }
  };
  const addMedicine = (m: MedicineSearchResult) => {
    if (lines.some(l => l.medicine.medicine_id === m.medicine_id)) return;
    setLines(v => [...v, { medicine: m, qty: '1', cost: '' }]); setMedicineResults([]); setMedicineSearch('');
  };
  const saveOrder = () => {
    const id = Number(supplierId);
    if (!id || !lines.length || lines.some(l => !Number.isInteger(Number(l.qty)) || Number(l.qty) <= 0 || (l.cost !== '' && Number(l.cost) < 0))) { setError('Choose a supplier and enter a quantity greater than zero for every medicine.'); return; }
    if (!window.confirm(`Create a draft order with ${lines.length} medicine${lines.length === 1 ? '' : 's'}? It will not be sent until you submit it.`)) return;
    void run(() => createOrder(id, lines.map(l => ({ medicine_id: l.medicine.medicine_id, qty_ordered: Number(l.qty), ...(l.cost === '' ? {} : { unit_cost: Number(l.cost) }) }))), 'Draft order created. Review it, then submit it.').then(ok => { if (ok) { setLines([]); setSupplierId(''); } });
  };
  const openOrder = async (id: number) => {
    setError(''); setSelectedGrn(null);
    try { setSelectedOrder(await getOrder(id)); setReceipt({}); }
    catch (e) { setError(errorText(e)); }
  };
  const openGrn = async (id: number) => {
    setError(''); setSelectedOrder(null);
    try { setSelectedGrn(await getGrn(id)); }
    catch (e) { setError(errorText(e)); }
  };
  const saveReceipt = () => {
    if (!selectedOrder) return;
    const items: GrnReceiptItem[] = selectedOrder.items
      .filter(i => Number(receipt[i.po_item_id]?.qty) > 0)
      .map(i => {
        const r = receipt[i.po_item_id];
        return {
          po_item_id: i.po_item_id, qty_received: Number(r.qty), batch_no: r.batch.trim(), expiry_date: r.expiry,
          received_unit: r.receivedUnit, units_per_pack: Number(r.unitsPerPack) || 1, selling_price_per_pack: Number(r.sellingPricePerPack) || 0,
        };
      });
    if (
      !items.length ||
      items.some(i => !Number.isInteger(i.qty_received) || !i.batch_no || !i.expiry_date || new Date(i.expiry_date) <= new Date() || i.units_per_pack <= 0 || !i.selling_price_per_pack)
    ) {
      setError('For each received medicine, enter a whole-number quantity, batch number, future expiry date, units per pack, and selling price.');
      return;
    }
    if (!window.confirm(`Add ${items.length} delivered batch${items.length === 1 ? '' : 'es'} to usable stock? Check the package details first.`)) return;
    void run(() => receiveOrder(selectedOrder.po_id, items), 'Delivery saved. Stock batches have been created.').then(ok => { if (ok) { setSelectedOrder(null); setReceipt({}); } });
  };
  const updateLine = (index: number, key: 'qty' | 'cost', value: string) => setLines(v => v.map((line, i) => i === index ? { ...line, [key]: value } : line));
  const updateReceipt = (id: number, key: keyof ReceiptLine, value: string) => setReceipt(v => ({ ...v, [id]: { ...emptyReceipt, ...v[id], [key]: value } }));
  const filteredSuppliers = suppliers.filter(s => `${s.name} ${s.city ?? ''} ${s.phone ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="ops-page">
    <PageHeader title={titles[mode][0]} help={titles[mode][1]} action={<button className="ops-btn" onClick={() => setRevision(n => n + 1)} disabled={loading}>Refresh data</button>} />
    <nav className="ops-tabs" aria-label="Purchasing pages">{tabs.map(([key, label]) => <NavLink key={key} to={key === 'suppliers' ? '/suppliers' : key === 'purchase-orders' ? '/purchase-orders' : key === 'goods-received' ? '/goods-received' : '/grn-review'} className={mode === key ? 'active' : ''}>{label}</NavLink>)}</nav>
    {error && <Notice tone="error">{error}</Notice>}{success && <Notice tone="success">{success}</Notice>}
    {mode === 'suppliers' && <><Notice>Supplier details are managed by an administrator. Pharmacists can use the directory to choose a supplier for an order.</Notice><Panel title="Supplier directory"><div className="ops-toolbar"><input className="ops-search" aria-label="Search suppliers" placeholder="Search supplier name or city" value={search} onChange={e => setSearch(e.target.value)} /></div>{loading ? <Empty text="Loading suppliers…" /> : filteredSuppliers.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>City</th><th>Status</th></tr></thead><tbody>{filteredSuppliers.map(s => <tr key={s.supplier_id}><td><strong>{s.name}</strong></td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td><td>{s.city || '—'}</td><td><span className={`ops-pill ${s.is_active ? 'ok' : 'bad'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></div> : <Empty text="No suppliers found." />}</Panel></>}
    {mode === 'purchase-orders' && <>
      <Panel title="Create a draft order"><div className="ops-panel-body"><div className="ops-grid"><div className="ops-field"><label htmlFor="order-supplier">Supplier</label><select id="order-supplier" value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Choose supplier</option>{suppliers.filter(s => s.is_active).map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>)}</select></div><div className="ops-field"><label htmlFor="medicine-search">Add medicine</label><div style={{ display: 'flex', gap: 7 }}><input id="medicine-search" value={medicineSearch} onChange={e => setMedicineSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void searchForMedicine(); }} placeholder="Type medicine name" /><button className="ops-btn" onClick={() => void searchForMedicine()}>Find</button></div></div></div>{medicineResults.length > 0 && <div className="ops-detail">{medicineResults.slice(0, 8).map(m => <button key={m.medicine_id} className="ops-btn" style={{ margin: 4 }} onClick={() => addMedicine(m)}>{m.name}{m.strength ? ` · ${m.strength}` : ''} +</button>)}</div>}{lines.map((l, i) => <div className="ops-count-row" key={l.medicine.medicine_id}><div><strong>{l.medicine.name}</strong><small>{l.medicine.strength || l.medicine.base_unit}</small></div><div className="ops-actions" style={{ margin: 0 }}><div className="ops-field"><label htmlFor={`order-qty-${i}`}>Quantity</label><input id={`order-qty-${i}`} type="number" min="1" step="1" style={{ width: 90 }} value={l.qty} onChange={e => updateLine(i, 'qty', e.target.value)} /></div><div className="ops-field"><label htmlFor={`order-cost-${i}`}>Cost per unit</label><input id={`order-cost-${i}`} type="number" min="0" step="0.01" style={{ width: 100 }} value={l.cost} onChange={e => updateLine(i, 'cost', e.target.value)} placeholder="Optional" /></div><button className="ops-btn danger" onClick={() => setLines(v => v.filter((_, n) => n !== i))}>Remove</button></div></div>)}<div className="ops-actions"><button className="ops-btn primary" disabled={busy} onClick={saveOrder}>Review and create draft</button></div></div></Panel>
      <Panel title="Recent orders">{loading ? <Empty text="Loading orders…" /> : orders.length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Order</th><th>Supplier</th><th>Date</th><th>Received</th><th>Estimated cost</th><th>Status</th><th></th></tr></thead><tbody>{orders.map(o => <tr key={o.po_id}><td><strong>PO-{o.po_id}</strong></td><td>{o.supplier.name}</td><td>{dateText(o.order_date)}</td><td>{o.receivedQty} / {o.orderedQty}</td><td>{money(o.totalAmount)}</td><td><span className="ops-pill">{o.status}</span></td><td><button className="ops-btn" onClick={() => void openOrder(o.po_id)}>Open order</button></td></tr>)}</tbody></table></div> : <Empty text="No orders yet. Create a draft above." />}</Panel>
    </>}
    {mode === 'goods-received' && <><Notice tone="warn">Only record stock you have physically checked. Do not receive expired or damaged medicines into usable stock.</Notice><Panel title="Orders waiting for delivery">{loading ? <Empty text="Loading orders…" /> : orders.filter(o => ['Submitted', 'PartiallyReceived'].includes(o.status)).length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Order</th><th>Supplier</th><th>Still to receive</th><th></th></tr></thead><tbody>{orders.filter(o => ['Submitted', 'PartiallyReceived'].includes(o.status)).map(o => <tr key={o.po_id}><td><strong>PO-{o.po_id}</strong></td><td>{o.supplier.name}</td><td>{Math.max(0, o.orderedQty - o.receivedQty)}</td><td><button className="ops-btn" onClick={() => void openOrder(o.po_id)}>Record delivery</button></td></tr>)}</tbody></table></div> : <Empty text="No submitted orders waiting for delivery." />}</Panel></>}
    {selectedOrder && (mode === 'purchase-orders' || mode === 'goods-received') && <Panel title={`Order PO-${selectedOrder.po_id} · ${selectedOrder.supplier.name}`} action={<button className="ops-btn" onClick={() => setSelectedOrder(null)}>Close details</button>}><div className="ops-panel-body"><Notice>Ordered: {selectedOrder.orderedQty} units · Received: {selectedOrder.receivedQty} units · Status: {selectedOrder.status}</Notice>{selectedOrder.items.map(i => { const received = i.grn_items.reduce((sum, g) => sum + g.qty_received, 0); const remaining = Math.max(0, i.qty_ordered - received); return <div className="ops-count-row" key={i.po_item_id}><div><strong>{i.medicine.name}</strong><small>Ordered {i.qty_ordered} · Already received {received} · Remaining {remaining}</small></div>{mode === 'goods-received' && remaining > 0 && <div className="ops-grid" style={{ minWidth: 560, flex: 1 }}><div className="ops-field"><label htmlFor={`grn-qty-${i.po_item_id}`}>Received now</label><input id={`grn-qty-${i.po_item_id}`} type="number" min="0" step="1" value={receipt[i.po_item_id]?.qty ?? ''} onChange={e => updateReceipt(i.po_item_id, 'qty', e.target.value)} /></div><div className="ops-field"><label htmlFor={`grn-unit-${i.po_item_id}`}>Received as</label><select id={`grn-unit-${i.po_item_id}`} value={receipt[i.po_item_id]?.receivedUnit ?? 'Tablet'} onChange={e => updateReceipt(i.po_item_id, 'receivedUnit', e.target.value)}>{RECEIVED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div><div className="ops-field"><label htmlFor={`grn-perpack-${i.po_item_id}`}>{i.medicine.base_unit || 'Units'} per pack</label><input id={`grn-perpack-${i.po_item_id}`} type="number" min="1" step="1" value={receipt[i.po_item_id]?.unitsPerPack ?? '1'} onChange={e => updateReceipt(i.po_item_id, 'unitsPerPack', e.target.value)} /></div><div className="ops-field"><label htmlFor={`grn-batch-${i.po_item_id}`}>Batch number</label><input id={`grn-batch-${i.po_item_id}`} value={receipt[i.po_item_id]?.batch ?? ''} onChange={e => updateReceipt(i.po_item_id, 'batch', e.target.value)} /></div><div className="ops-field"><label htmlFor={`grn-expiry-${i.po_item_id}`}>Expiry date</label><input id={`grn-expiry-${i.po_item_id}`} type="date" value={receipt[i.po_item_id]?.expiry ?? ''} onChange={e => updateReceipt(i.po_item_id, 'expiry', e.target.value)} /></div><div className="ops-field"><label htmlFor={`grn-sell-${i.po_item_id}`}>Selling price per pack</label><input id={`grn-sell-${i.po_item_id}`} type="number" min="0" step="0.01" value={receipt[i.po_item_id]?.sellingPricePerPack ?? ''} onChange={e => updateReceipt(i.po_item_id, 'sellingPricePerPack', e.target.value)} /></div></div>}</div>; })}<div className="ops-actions">{mode === 'goods-received' && <button className="ops-btn primary" disabled={busy} onClick={saveReceipt}>Check and save delivery</button>}{mode === 'purchase-orders' && selectedOrder.status === 'Draft' && <button className="ops-btn primary" disabled={busy} onClick={() => { if (window.confirm('Submit this order? It will be ready to receive deliveries.')) void run(() => submitOrder(selectedOrder.po_id), 'Order submitted.'); }}>Submit order</button>}{mode === 'purchase-orders' && selectedOrder.status === 'Received' && <button className="ops-btn primary" disabled={busy} onClick={() => { if (window.confirm('Close this fully received order?')) void run(() => closeOrder(selectedOrder.po_id), 'Order closed.'); }}>Close order</button>}</div></div></Panel>}
    {(mode === 'goods-received' || mode === 'grn-review') && <Panel title={mode === 'grn-review' ? 'Deliveries with differences' : 'Recent deliveries'}>{loading ? <Empty text="Loading deliveries…" /> : grns.filter(g => mode !== 'grn-review' || g.has_discrepancy).length ? <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Delivery</th><th>Order</th><th>Supplier</th><th>Received</th><th>Difference</th><th></th></tr></thead><tbody>{grns.filter(g => mode !== 'grn-review' || g.has_discrepancy).map(g => <tr key={g.grn_id}><td><strong>GRN-{g.grn_id}</strong></td><td>PO-{g.po_id}</td><td>{g.purchase_order.supplier.name}</td><td>{dateText(g.received_at)}</td><td><span className={`ops-pill ${g.has_discrepancy ? 'warn' : 'ok'}`}>{g.has_discrepancy ? g.discrepancy_reviewed_at ? 'Admin reviewed' : 'Needs admin review' : 'No difference'}</span></td><td><button className="ops-btn" onClick={() => void openGrn(g.grn_id)}>View</button></td></tr>)}</tbody></table></div> : <Empty text="No deliveries found." />}</Panel>}
    {selectedGrn && (mode === 'goods-received' || mode === 'grn-review') && <Panel title={`Delivery GRN-${selectedGrn.grn_id}`} action={<button className="ops-btn" onClick={() => setSelectedGrn(null)}>Close details</button>}><div className="ops-panel-body"><Notice tone={selectedGrn.has_discrepancy ? 'warn' : 'success'}>{selectedGrn.has_discrepancy ? 'Received quantity differs from the order. An administrator must review this.' : 'No quantity difference recorded.'}</Notice>{selectedGrn.items?.map(i => <div className="ops-count-row" key={i.grn_item_id}><div><strong>{i.po_item.medicine.name}</strong><small>Batch {i.batch?.batch_no || '—'} · Expires {dateText(i.batch?.expiry_date)}</small></div><strong>{i.qty_received} received</strong></div>)}</div></Panel>}
  </div>;
}
