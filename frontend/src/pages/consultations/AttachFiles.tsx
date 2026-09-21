import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { UploadIcon, FileIcon, TrashIcon, PaperclipIcon } from '../../components/layout/Icons';
import type { ConsultationDocument } from '../../lib/consultations';
import { formatFileSize, formatDateTime } from './consultationUtils';

interface AttachFilesProps {
  documents: ConsultationDocument[];
  disabled: boolean;
  uploading: boolean;
  onUploadFile: (file: File) => Promise<void>;
  onDeleteFile: (documentId: number) => Promise<void>;
}

const AttachFiles = ({ documents, disabled, uploading, onUploadFile, onDeleteFile }: AttachFilesProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await onUploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {!disabled && (
        <div className="cons-dropzone">
          <div className="cons-dropzone-icon">
            <UploadIcon />
          </div>
          <div>
            Drag &amp; drop files here or{' '}
            <button
              type="button"
              className="cons-btn"
              style={{ display: 'inline-flex', padding: '4px 12px' }}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Browse'}
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11.5, color: '#94a3b8' }}>Supports: PDF, JPG, PNG (Max 10MB)</div>
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={handleFileSelect} />
        </div>
      )}

      {documents.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {documents.map((d) => (
            <div className="cons-file-row" key={d.document_id}>
              <span className="cons-file-icon">
                <FileIcon />
              </span>
              <div className="cons-file-info">
                <div className="cons-file-name">{d.original_name}</div>
                <div className="cons-file-meta">
                  {formatFileSize(d.size_bytes)} · uploaded {formatDateTime(d.uploaded_at)} by {d.uploader.username}
                </div>
              </div>
              {!disabled && (
                <button type="button" className="pat-icon-btn" onClick={() => onDeleteFile(d.document_id)} aria-label="Delete file">
                  <TrashIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {documents.length === 0 && disabled && (
        <p className="fam-muted" style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <PaperclipIcon /> No files attached.
        </p>
      )}
    </>
  );
};

export default AttachFiles;
