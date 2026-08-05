export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export interface MasterDataTabDef {
  type: 'MedicineCategory' | 'PaymentMethod' | 'DiscountType' | 'MedicalCondition';
  label: string;
  description: string;
}

export const MASTER_DATA_TABS: MasterDataTabDef[] = [
  { type: 'MedicineCategory', label: 'Medicine Categories', description: 'Used to categorize medicines in Pharmacy and Medicines.' },
  { type: 'PaymentMethod', label: 'Payment Methods', description: 'Advisory list only — actual payments still record Cash/Card/Mobile.' },
  { type: 'DiscountType', label: 'Discount Types', description: 'Reasons available when applying a discount on an invoice.' },
  { type: 'MedicalCondition', label: 'Medical Conditions', description: 'Ad-hoc condition tags doctors can pick during a consultation.' },
];
