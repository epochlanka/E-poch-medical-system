export const formatCurrency = (n: number) =>
  `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const medicineCode = (id: number) => `MED-${String(id).padStart(4, '0')}`;

const CATEGORY_BADGES = ['badge-blue', 'badge-green', 'badge-purple', 'badge-amber', 'badge-red'];

// Deterministic per-category color so the same category always renders the same badge,
// without needing a category -> color mapping table maintained by hand.
export const categoryBadgeClass = (category: string | null) => {
  if (!category) return 'badge-gray';
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_BADGES[hash % CATEGORY_BADGES.length];
};

export const COMMON_MEDICINE_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Inhaler', 'Cream', 'Ointment', 'Drops', 'Suspension'];
export const COMMON_UNITS = ['Tablet', 'Capsule', 'Bottle', 'Strip', 'Vial', 'Tube', 'Sachet', 'Inhaler'];
