/**
 * One definition of "how much of this medicine can we actually give a patient".
 *
 * Three code paths used to answer this differently: the catalog and the prescription builder
 * filtered out expired batches, the low-stock alert did not. A medicine whose entire stock had
 * expired therefore read "Out of Stock" on the catalog and "Not Available in Clinic" to the
 * doctor, while raising no reorder alert at all — so the clinic quietly stopped reordering
 * something it could not dispense.
 *
 * Two quantities, deliberately distinct:
 *   - owned   : everything still on hand, expired or not. This is inventory we paid for and have
 *               not written off, so it is what stock value is based on.
 *   - usable  : what may actually be dispensed today. This is what reorder decisions and
 *               "in stock / low / out of stock" must be based on.
 */

export interface StockBatchQty {
  qty_on_hand: number;
  expiry_date: Date;
}

/** Everything on hand, expired included — owned inventory, not dispensable inventory. */
export const ownedQty = (batches: StockBatchQty[]): number => batches.reduce((sum, b) => sum + b.qty_on_hand, 0);

/** Batches that may be dispensed today: positive quantity and not past their expiry date. */
export const usableBatches = <T extends StockBatchQty>(batches: T[], now = new Date()): T[] =>
  batches.filter((b) => b.qty_on_hand > 0 && b.expiry_date > now);

/** What can actually be given to a patient today. Reorder decisions must use this. */
export const usableQty = (batches: StockBatchQty[], now = new Date()): number => ownedQty(usableBatches(batches, now));

/**
 * One number for the whole clinic: fewer than this many usable base units of any medicine
 * (tablets, capsules, ml, grams) and it is low.
 *
 * This replaces the per-medicine reorder_level / max_stock_level pair. Those asked whoever added
 * a medicine to pick two numbers they had no basis for, and left every medicine added in a hurry
 * sitting at a reorder level of 0 — which can never trigger, so those medicines were silently
 * excluded from low-stock alerts entirely.
 */
export const LOW_STOCK_THRESHOLD = 10;

export type StockStatus = 'out-of-stock' | 'low' | 'in-stock';

/** The single rule behind every "In Stock / Low Stock / Out of Stock" badge in the system. */
export const stockStatusFor = (batches: StockBatchQty[], now = new Date()): StockStatus => {
  const usable = usableQty(batches, now);
  if (usable <= 0) return 'out-of-stock';
  return usable < LOW_STOCK_THRESHOLD ? 'low' : 'in-stock';
};

/** True when this medicine needs reordering. Every low-stock check in the app routes through here. */
export const isLowStock = (batches: StockBatchQty[], now = new Date()): boolean =>
  usableQty(batches, now) < LOW_STOCK_THRESHOLD;
