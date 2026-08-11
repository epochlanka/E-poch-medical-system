import type { ReactNode } from 'react';

const Base = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const DashboardIcon = () => (
  <Base>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Base>
);
export const PatientsIcon = () => (
  <Base>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
    <circle cx="17.5" cy="9" r="2.4" />
    <path d="M15.3 20c.3-2.6 1.9-4.6 4.2-5.2" />
  </Base>
);
export const FamiliesIcon = () => (
  <Base>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9.5h13V10" />
    <path d="M10 19.5v-5h4v5" />
  </Base>
);
export const CalendarIcon = () => (
  <Base>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Base>
);
export const StethoscopeIcon = () => (
  <Base>
    <path d="M5 4v6a4 4 0 0 0 8 0V4" />
    <path d="M9 15v1a5 5 0 0 0 10 0v-2.5" />
    <circle cx="19" cy="10.5" r="1.6" />
    <circle cx="5" cy="4" r="1" />
    <circle cx="13" cy="4" r="1" />
  </Base>
);
export const PrescriptionIcon = () => (
  <Base>
    <path d="M6 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    <path d="M8 8h7M8 12h4M8 16h5" />
  </Base>
);
export const PharmacyIcon = () => (
  <Base>
    <path d="m8.5 8.5 7 7" />
    <path d="M7.5 15.5 4.9 18a3 3 0 1 0 4.2 4.2L11.5 19.6" />
    <path d="M15.5 8.5 19 5a3 3 0 1 0-4.2-4.2l-2.6 2.6" />
    <path d="m11 6-1-1 4-4 1 1M18 13l1 1-4 4-1-1" />
  </Base>
);
export const MedicineIcon = () => (
  <Base>
    <rect x="4" y="7" width="16" height="13" rx="2" />
    <path d="M4 12h16M9 3v4M15 3v4" />
  </Base>
);
export const StockIcon = () => (
  <Base>
    <path d="M21 8 12 3 3 8l9 5 9-5Z" />
    <path d="M3 8v9l9 5 9-5V8M12 13v9" />
  </Base>
);
export const PurchaseOrderIcon = () => (
  <Base>
    <circle cx="9" cy="20" r="1.3" />
    <circle cx="17" cy="20" r="1.3" />
    <path d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 8H6" />
  </Base>
);
export const SupplierIcon = () => (
  <Base>
    <rect x="2" y="8" width="12" height="9" rx="1" />
    <path d="M14 11h4l3 3v3h-7z" />
    <circle cx="7" cy="19" r="1.6" />
    <circle cx="17.5" cy="19" r="1.6" />
  </Base>
);
export const InvoiceIcon = () => (
  <Base>
    <path d="M6 2h9l3 3v17H6z" />
    <path d="M15 2v3h3M9 11h6M9 15h6M9 7h3" />
  </Base>
);
export const PaymentIcon = () => (
  <Base>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20M6 15h4" />
  </Base>
);
export const ReportsIcon = () => (
  <Base>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Base>
);
export const UsersIcon = () => (
  <Base>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
    <path d="M16 4.2a3.2 3.2 0 0 1 0 6M20.5 20c-.3-2.6-1.6-4.6-3.5-5.4" />
  </Base>
);
export const SettingsIcon = () => (
  <Base>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 13a7.6 7.6 0 0 0 .1-2l2-1.5-2-3.5-2.4.7a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.4 2.4a7.7 7.7 0 0 0-1.7 1l-2.4-.7-2 3.5 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-.7c.5.4 1.1.8 1.7 1L11 21h4l.4-2.4c.6-.2 1.2-.6 1.7-1l2.4.7 2-3.5-2.1-1.6Z" />
  </Base>
);
export const SearchIcon = () => (
  <Base size={18}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Base>
);
export const BellIcon = () => (
  <Base size={20}>
    <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </Base>
);
export const ClockIcon = () => (
  <Base size={20}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </Base>
);
export const ChevronDownIcon = () => (
  <Base size={16}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);
export const MenuIcon = () => (
  <Base size={22}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Base>
);
export const LogOutIcon = () => (
  <Base size={17}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Base>
);
export const PlusIcon = () => (
  <Base size={20}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);
export const AlertIcon = () => (
  <Base size={16}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Base>
);
export const ExpiryIcon = () => (
  <Base size={16}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 1.5M9 2h6" />
  </Base>
);
export const DollarIcon = () => (
  <Base>
    <path d="M12 2v20" />
    <path d="M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.6-5 3.5S9.2 10 12 10s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" />
  </Base>
);
export const PillIcon = () => (
  <Base>
    <rect x="3" y="10.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 14)" />
    <path d="m9.5 9 5 5" />
  </Base>
);
export const ChevronRightIcon = () => (
  <Base size={16}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);
export const ChevronLeftIcon = () => (
  <Base size={16}>
    <path d="m15 6-6 6 6 6" />
  </Base>
);
export const DownloadIcon = () => (
  <Base size={16}>
    <path d="M12 3v12m0 0-4-4m4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Base>
);
export const FilterIcon = () => (
  <Base size={16}>
    <path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z" />
  </Base>
);
export const EyeIcon = () => (
  <Base size={16}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </Base>
);
export const EditIcon = () => (
  <Base size={16}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Base>
);
export const MoreVerticalIcon = () => (
  <Base size={16}>
    <circle cx="12" cy="5" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="12" cy="19" r="1.2" />
  </Base>
);
export const XIcon = () => (
  <Base size={18}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
);
export const RefreshIcon = () => (
  <Base size={16}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </Base>
);
export const PhoneIcon = () => (
  <Base size={14}>
    <path d="M4 3h4l1.5 5-2.5 1.5a13 13 0 0 0 6 6L14.5 13l5 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 2 5a2 2 0 0 1 2-2Z" />
  </Base>
);
export const MapPinIcon = () => (
  <Base size={14}>
    <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12Z" />
    <circle cx="12" cy="9" r="2.3" />
  </Base>
);
export const StarIcon = () => (
  <Base size={14}>
    <path d="m12 3 2.6 5.8 6.2.6-4.7 4.2 1.4 6.1L12 16.7 6.5 19.7l1.4-6.1-4.7-4.2 6.2-.6Z" />
  </Base>
);
export const MergeIcon = () => (
  <Base size={16}>
    <path d="M8 3v6a4 4 0 0 0 4 4h4" />
    <path d="M16 3v18M8 15v6" />
    <path d="m13 10 3 3 3-3" />
  </Base>
);
export const PrintIcon = () => (
  <Base size={16}>
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="8" rx="1.5" />
    <path d="M6 17v4h12v-4" />
  </Base>
);
export const TrashIcon = () => (
  <Base size={15}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Base>
);
export const PaperclipIcon = () => (
  <Base size={20}>
    <path d="M21 11.5 12.5 20a4.5 4.5 0 0 1-6.4-6.4L14.6 5a3 3 0 0 1 4.3 4.2l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.1-7.1" />
  </Base>
);
export const FileIcon = () => (
  <Base size={16}>
    <path d="M6 2h9l3 3v17H6z" />
    <path d="M15 2v3h3" />
  </Base>
);
export const UploadIcon = () => (
  <Base size={22}>
    <path d="M12 16V4m0 0-4 4m4-4 4 4" />
    <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Base>
);
export const CheckCircleIcon = () => (
  <Base size={16}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </Base>
);
export const SaveIcon = () => (
  <Base size={16}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </Base>
);
export const SendIcon = () => (
  <Base size={16}>
    <path d="m3 3 18 9-18 9 4-9-4-9Z" />
    <path d="M7 12h14" />
  </Base>
);
export const HeartPulseIcon = () => (
  <Base>
    <path d="M19 14c1.5-1.5 3-3.5 3-6a4.5 4.5 0 0 0-8-2.5A4.5 4.5 0 0 0 6 8c0 2.5 1.5 4.5 3 6l5 6 5-6Z" />
    <path d="M3 12h4l1.5-3L11 15l1.5-4L14 12h3" />
  </Base>
);
export const TruckIcon = () => (
  <Base>
    <rect x="1" y="7" width="13" height="10" rx="1.5" />
    <path d="M14 10h4l3.5 3.5V17h-3" />
    <circle cx="6.5" cy="19" r="1.7" />
    <circle cx="17.5" cy="19" r="1.7" />
  </Base>
);
export const XCircleIcon = () => (
  <Base>
    <circle cx="12" cy="12" r="9" />
    <path d="m9.5 9.5 5 5m0-5-5 5" />
  </Base>
);
export const AdjustIcon = () => (
  <Base>
    <path d="M4 6h10M17 6h3M4 12h3M9 12h11M4 18h13M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="6" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Base>
);
export const MegaphoneIcon = () => (
  <Base size={16}>
    <path d="M3 11v2a2 2 0 0 0 2 2h1l1 5h2l-1-5h1l9 4V7l-9 4H5a2 2 0 0 0-2 2Z" />
    <path d="M17 9.5a3 3 0 0 1 0 5" />
  </Base>
);
export const ClipboardIcon = () => (
  <Base size={32}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <rect x="9" y="2" width="6" height="4" rx="1" />
    <path d="M9 11h6M9 15h4" />
  </Base>
);
