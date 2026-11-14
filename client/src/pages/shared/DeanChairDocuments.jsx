import { useState, useEffect } from 'react';
import { apiAuth, apiAuthUpload, apiAuthDownload } from '../../lib/api.js';
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

const DEFAULT_PROGRAM_OPTIONS = [
  { value: 'GENERAL', label: 'General / All Programs' },
  { value: 'BSCS', label: 'BS Computer Science (BSCS)' },
  { value: 'BSIT', label: 'BS Information Technology (BSIT)' },
  { value: 'BSCE', label: 'BS Civil Engineering (BSCE)' },
  { value: 'BSCPE', label: 'BS Computer Engineering (BSCPE)' },
];

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

function getProgramBadge(program = '') {
  const code = (program || 'GENERAL').toUpperCase();
  const isGeneral = code === 'GENERAL';
  return (
    <span className={`doc-program-badge ${isGeneral ? 'doc-program-general' : 'doc-program-specific'}`}>
      {code}
    </span>
  );
}

export default function DeanChairDocuments({ me }) {
  const isDean = me?.role === 'dean';
  const isChair = me?.role === 'program_chair';

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [filterProgram, setFilterProgram] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Dynamic programs list from catalog
  const [programOptions, setProgramOptions] = useState(DEFAULT_PROGRAM_OPTIONS);

  // Upload state
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploadProgram, setUploadProgram] = useState('GENERAL');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch available programs for the dropdown, scoped strictly to what the user has access to
  useEffect(() => {
    async function loadPrograms() {
      try {
        const res = await apiAuth('/api/catalog/programs');
        const allPrograms = Array.isArray(res.programs) ? res.programs : [];

        let scopedPrograms = allPrograms;

        if (isChair) {
          // Program chair can only see and upload to their assigned program (+ GENERAL)
          const chairProgramId = String(me?.program?._id || me?.program || '');
          const chairProgramCode = String(me?.program?.code || '').toUpperCase();

          scopedPrograms = allPrograms.filter(
            (p) => String(p._id) === chairProgramId || (p.code && p.code.toUpperCase() === chairProgramCode)
          );
        } else if (isDean) {
          // Dean can only see and upload to programs within their department (+ GENERAL)
          const deanDeptId = String(me?.department?._id || me?.department || '');
          if (deanDeptId) {
            scopedPrograms = allPrograms.filter((p) => {
              const progDeptId = String(p.department?._id || p.department || '');
              return progDeptId === deanDeptId;
            });
          }
        }

        const formatted = scopedPrograms.map((p) => ({
          value: (p.code || p.name).toUpperCase(),
          label: `${p.name} (${p.code || 'N/A'})`,
        }));

        const options = [
          { value: 'GENERAL', label: 'General / All Programs' },
          ...formatted,
        ];

        setProgramOptions(options);

        // Preselect initial program
        if (isChair && me?.program?.code) {
          setUploadProgram(me.program.code.toUpperCase());
        } else if (isDean && formatted.length > 0) {
          setUploadProgram(formatted[0].value);
        }
      } catch {
        // Fall back to default options
      }
    }
    loadPrograms();
  }, [isChair, isDean, me]);

  // Set default program for Program Chair
  useEffect(() => {
    if (isChair) {
      const chairCode = me?.program?.code || (typeof me?.program === 'string' ? me.program : '');
      if (chairCode) {
        setUploadProgram(chairCode.toUpperCase());
      }
    }
  }, [isChair, me]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (search.trim()) params.append('search', search.trim());
      if (selectedType) params.append('fileType', selectedType);
      if (filterProgram) params.append('program', filterProgram);

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
  }, [page, selectedType, filterProgram]);

  // Debounced search
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
    if (!uploadProgram) {
      setUploadError('Target program is required.');
      return;
    }

    try {
      setUploading(true);
      setUploadError('');
      setUploadSuccess('');

      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('program', uploadProgram);
      formData.append('file', file);

      await apiAuthUpload('/api/documents', formData);

      setUploadSuccess(`Document "${title.trim()}" uploaded successfully for [${uploadProgram}]!`);
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

  const [downloadingId, setDownloadingId] = useState(null);

  const handleDownload = async (doc) => {
    try {
      setDownloadingId(doc._id);
      await apiAuthDownload(`/api/documents/${doc._id}/download`, doc.originalFilename);
    } catch (err) {
      alert(err.message || 'Failed to download document.');
    } finally {
      setDownloadingId(null);
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
      key: 'program',
      header: 'Program',
      width: '110px',
      render: (row) => getProgramBadge(row.program),
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
      width: '150px',
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
          <button
            type="button"
            className="doc-btn-download"
            onClick={() => handleDownload(row)}
            disabled={downloadingId === row._id}
            title="Download Document"
          >
            {downloadingId === row._id ? 'Downloading...' : 'Download'}
          </button>
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
        subtitle={
          isDean
            ? 'Upload and manage syllabus, reference manuals, reviewers, and files across college programs.'
            : `Upload and manage documents for ${me?.program?.name || 'your program'} and general resources.`
        }
      />

      {/* Upload Box */}
      <section className="doc-upload-box">
        <h2 className="box-title">Upload Academic Document</h2>
        <form className="doc-upload-form" onSubmit={handleUpload}>
          <div className="doc-form-row doc-form-row-three">
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
              <label htmlFor="document-program-select" className="doc-label">
                Target Program <span className="required-star">*</span>
              </label>
              <DropdownSelect
                id="document-program-select"
                value={uploadProgram}
                onChange={(e) => setUploadProgram(e.target.value)}
                options={programOptions}
                placeholder="Select Program"
                ariaLabel="Select target program"
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
            <strong>PowerPoint (.ppt, .pptx)</strong>, and <strong>Excel (.xls, .xlsx)</strong> up to 50MB. Files tagged with <strong>General</strong> are available to all students & alumni.
          </div>

          {uploadError && <div className="doc-alert doc-alert-error">{uploadError}</div>}
          {uploadSuccess && <div className="doc-alert doc-alert-success">{uploadSuccess}</div>}

          <div className="doc-form-actions">
            <button
              type="submit"
              className="btn-upload-submit"
              disabled={uploading || !file || !title.trim() || !uploadProgram}
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

          {/* Program filter for Deans or Chairs */}
          <div className="doc-filter-select">
            <DropdownSelect
              value={filterProgram}
              onChange={(e) => {
                setFilterProgram(e.target.value);
                setPage(1);
              }}
              placeholder="All Programs"
              options={programOptions}
              ariaLabel="Filter by program"
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
            This will permanently remove the file ({documentToDelete?.originalFilename}) for [
            {documentToDelete?.program || 'GENERAL'}] from Cloudflare R2 storage and the system.
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
