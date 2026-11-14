import { useState, useEffect } from 'react';
import { apiAuth } from '../../lib/api.js';
import Table from '../../components/Table.jsx';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import '../../styles/shared/ManageDocuments.css';

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

export default function DocumentLibrary({ me }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // The backend automatically scopes documents to the learner's program + GENERAL
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

  const userProgramLabel = me?.program?.name || (me?.program?.code ? `${me.program.code}` : 'Your Degree Program');

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
      header: 'Scope',
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
      header: 'Shared By',
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
      header: 'Shared Date',
      width: '140px',
      render: (row) => formatDate(row.createdAt),
    },
    {
      key: 'actions',
      header: 'Action',
      width: '140px',
      className: 'ui-table-actions-cell',
      headerClassName: 'ui-table-th-actions',
      render: (row) => (
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
      ),
    },
  ];

  return (
    <main className="manage-docs-page page-shell">
      <PageHeader
        title="Academic Documents & Resources"
        subtitle={`Browse and download academic resources for ${userProgramLabel} and general university reviewers.`}
      />

      <section className="doc-list-box">
        <h2 className="box-title">Available Academic Documents ({totalCount})</h2>

        {/* Unified Search and Dropdown Filter Bar */}
        <div className="doc-filter-bar">
          <div className="doc-search-wrapper">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search documents by title or filename..."
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
          emptyMessage="No academic documents are currently available for your program."
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
    </main>
  );
}
