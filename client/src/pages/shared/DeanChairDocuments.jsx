import { useState, useEffect } from 'react';
import { apiAuth, apiAuthUpload } from '../../lib/api.js';
import Table from '../../components/Table.jsx';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import { Modal } from '../../components/Modal.jsx';
import '../../styles/shared/ManageDocuments.css';

// Allowed MIME types and extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'];
const ACCEPT_ATTRIBUTE = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const FILE_TYPE_OPTIONS = [
  { value: 'pdf', label: 'PDF (.pdf)' },
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'doc', label: 'Word (.doc)' },
  { value: 'pptx', label: 'PowerPoint (.pptx)' },
  { value: 'ppt', label: 'PowerPoint (.ppt)' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'xls', label: 'Excel (.xls)' },
];

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getFileTypeBadge(fileType = '') {
  const type = fileType.toLowerCase();
  let badgeClass = 'badge-other';

  if (type === 'pdf') badgeClass = 'badge-pdf';
  else if (type === 'doc' || type === 'docx') badgeClass = 'badge-word';
  else if (type === 'ppt' || type === 'pptx') badgeClass = 'badge-ppt';
  else if (type === 'xls' || type === 'xlsx') badgeClass = 'badge-excel';

  return <span className={`doc-type-badge ${badgeClass}`}>{type.toUpperCase()}</span>;
}

export default function DeanChairDocuments({ me }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Upload state
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (search.trim()) params.append('search', search.trim());
      if (selectedType) params.append('fileType', selectedType);

      const res = await apiAuth(`/api/documents?${params.toString()}`);
      setDocuments(res.documents || []);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.total || 0);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [page, selectedType]);

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleFileChange = (e) => {
    setUploadError('');
    setUploadSuccess('');
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      return;
    }

    const name = selectedFile.name.toLowerCase();
    const isValid = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    if (!isValid) {
      setUploadError(
        'Invalid file type. Allowed files are: Word (.doc, .docx), PDF (.pdf), PowerPoint (.ppt, .pptx), and Excel (.xls, .xlsx).'
      );
      setFile(null);
      e.target.value = '';
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setUploadError('File exceeds the 50MB maximum size limit.');
      setFile(null);
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
    if (!title.trim()) {
      const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name;
      setTitle(baseName);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setUploadError('Document title is required.');
      return;
    }
    if (!file) {
      setUploadError('Please select a valid document to upload.');
      return;
    }

    try {
      setUploading(true);
      setUploadError('');
      setUploadSuccess('');

      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('file', file);

      await apiAuthUpload('/api/documents', formData);

      setUploadSuccess(`Document "${title.trim()}" uploaded successfully!`);
      setTitle('');
      setFile(null);
      const fileInput = document.getElementById('document-file-input');
      if (fileInput) fileInput.value = '';

      setPage(1);
      fetchDocuments();
    } catch (err) {
      setUploadError(err.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = (doc) => {
    setDocumentToDelete(doc);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!documentToDelete) return;
    try {
      setDeleting(true);
      await apiAuth(`/api/documents/${documentToDelete._id}`, {
        method: 'DELETE',
      });
      setDeleteModalOpen(false);
      setDocumentToDelete(null);
      fetchDocuments();
    } catch (err) {
      alert(err.message || 'Failed to delete document.');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Document Title & File',
      render: (row) => (
        <div className="doc-table-title-cell">
          <div className="doc-title-text">{row.title}</div>
          <div className="doc-filename-text">{row.originalFilename}</div>
        </div>
      ),
    },
    {
      key: 'fileType',
      header: 'Type',
      width: '90px',
      render: (row) => getFileTypeBadge(row.fileType),
    },
    {
      key: 'fileSize',
      header: 'Size',
      width: '100px',
      render: (row) => formatBytes(row.fileSize),
    },
    {
      key: 'uploadedBy',
      header: 'Uploaded By',
      render: (row) => (
        <div>
          <div className="doc-uploader-name">{row.uploadedBy?.name || 'Academic Faculty'}</div>
          <div className="doc-uploader-role">
            {row.uploadedBy?.role === 'dean' ? 'Dean' : 'Program Chair'}
          </div>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Uploaded Date',
      width: '160px',
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '180px',
      className: 'ui-table-actions-cell',
      headerClassName: 'ui-table-th-actions',
      render: (row) => (
        <div className="doc-table-actions">
          <a
            href={row.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={row.originalFilename}
            className="doc-btn-download"
            title="Download Document"
          >
            Download
          </a>
          <button
            type="button"
            className="doc-btn-delete"
            onClick={() => confirmDelete(row)}
            title="Delete Document"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <main className="manage-docs-page page-shell">
      <PageHeader
        title="Academic Documents Management"
        subtitle="Upload and manage syllabus, reference manuals, reviewers, and academic files."
      />

      {/* Upload Box */}
      <section className="doc-upload-box">
        <h2 className="box-title">Upload Academic Document</h2>
        <form className="doc-upload-form" onSubmit={handleUpload}>
          <div className="doc-form-row">
            <div className="doc-form-group">
              <label htmlFor="document-title-input" className="doc-label">
                Document Title <span className="required-star">*</span>
              </label>
              <input
                id="document-title-input"
                type="text"
                className="doc-input"
                placeholder="e.g., Board Exam Reviewer - Module 1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
            </div>

            <div className="doc-form-group">
              <label htmlFor="document-file-input" className="doc-label">
                Select File (.pdf, .doc, .docx, .ppt, .pptx, .xls, .xlsx){' '}
                <span className="required-star">*</span>
              </label>
              <input
                id="document-file-input"
                type="file"
                className="doc-file-input"
                accept={ACCEPT_ATTRIBUTE}
                onChange={handleFileChange}
                required
              />
            </div>
          </div>

          <div className="doc-upload-meta-info">
            Supported formats: <strong>Word (.doc, .docx)</strong>, <strong>PDF (.pdf)</strong>,{' '}
            <strong>PowerPoint (.ppt, .pptx)</strong>, and <strong>Excel (.xls, .xlsx)</strong> up to 50MB.
          </div>

          {uploadError && <div className="doc-alert doc-alert-error">{uploadError}</div>}
          {uploadSuccess && <div className="doc-alert doc-alert-success">{uploadSuccess}</div>}

          <div className="doc-form-actions">
            <button
              type="submit"
              className="btn-upload-submit"
              disabled={uploading || !file || !title.trim()}
            >
              {uploading ? 'Uploading to R2...' : 'Upload Document'}
            </button>
          </div>
        </form>
      </section>

      {/* Existing Documents List */}
      <section className="doc-list-box">
        <h2 className="box-title">Shared Academic Documents ({totalCount})</h2>

        {/* Unified Search and Dropdown Filter Bar */}
        <div className="doc-filter-bar">
          <div className="doc-search-wrapper">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by title or filename..."
              ariaLabel="Search documents"
            />
          </div>

          <div className="doc-filter-select">
            <DropdownSelect
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(1);
              }}
              placeholder="All File Types"
              options={FILE_TYPE_OPTIONS}
              ariaLabel="Filter by file type"
            />
          </div>
        </div>

        <Table
          columns={columns}
          data={documents}
          loading={loading}
          wrapperClassName="doc-table-card-override"
          emptyMessage="No academic documents found. Upload the first one above."
        />

        <div className="ui-table-footer">
          <Pagination
            currentPage={page}
            totalItems={totalCount}
            pageSize={15}
            onPageChange={setPage}
            itemLabel="documents"
          />
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Document"
        size="compact"
      >
        <div className="modal-confirmation">
          <div className="modal-confirmation-message">
            Are you sure you want to delete <strong>{documentToDelete?.title}</strong>?
          </div>
          <div className="modal-confirmation-extra">
            This will permanently remove the file ({documentToDelete?.originalFilename}) from Cloudflare R2 storage and the system. Students and alumni will no longer have access to download it.
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => setDeleteModalOpen(false)}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Document'}
          </button>
        </div>
      </Modal>
    </main>
  );
}
