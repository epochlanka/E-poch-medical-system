import type { ConsultationDocument } from '../../lib/consultations';
import AttachFiles from './AttachFiles';

interface DocumentsTabProps {
  documents: ConsultationDocument[];
  disabled: boolean;
  uploading: boolean;
  onUploadFile: (file: File) => Promise<void>;
  onDeleteFile: (documentId: number) => Promise<void>;
  hasConsultation: boolean;
}

const DocumentsTab = ({ documents, disabled, uploading, onUploadFile, onDeleteFile, hasConsultation }: DocumentsTabProps) => (
  <div className="card">
    <div className="card-header">
      <h3 className="card-title">Documents</h3>
    </div>
    {!hasConsultation ? (
      <div className="card-empty">Save the consultation before attaching files.</div>
    ) : (
      <AttachFiles documents={documents} disabled={disabled} uploading={uploading} onUploadFile={onUploadFile} onDeleteFile={onDeleteFile} />
    )}
  </div>
);

export default DocumentsTab;
