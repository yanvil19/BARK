import { useEffect, useMemo, useState } from 'react';
import { apiAuth, getStoredAuthToken } from '../../lib/api.js';
import '../../styles/alumni/AlumniAvailableExams.css';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import {
  getOfflineExams,
  saveOfflineExams,
  saveOfflineProfile,
  saveOfflineImage,
  getOfflineProfile,
  setMeta,
  getMeta,
} from '../../lib/offlineDb.js';

const BASE = import.meta.env.VITE_API_URL;

function IconClock(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v6l4 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconList(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 6h13M8 12h13M8 18h13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M7 3v3M17 3v3M4 8h16M6 6h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatStartDateTime(value) {
  return value
    ? new Date(value).toLocaleDateString('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : 'TBA';
}

function getExamStatus(exam) {
  return exam.status === 'ongoing' ? 'ongoing' : 'published';
}

function getStatusLabel(status) {
  return status === 'ongoing' ? 'On-going' : 'Published';
}

function formatDuration(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return 'Untimed';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function SkeletonCard({ keyId }) {
  return (
    <div key={keyId} className="aae-card aae-card--skeleton" aria-hidden="true">
      <div className="aae-skel-title aae-pulse" />
      <div className="aae-skel-subtitle aae-pulse" />
      <div className="aae-skel-row">
        <div className="aae-skel-pill aae-pulse" />
        <div className="aae-skel-pill aae-pulse" />
        <div className="aae-skel-pill aae-pulse" />
      </div>
      <div className="aae-skel-btn aae-pulse" />
    </div>
  );
}

export default function AlumniAvailableExams({ onTakeExam }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [offlineExamIds, setOfflineExamIds] = useState(new Set());
  const [isOfflineView, setIsOfflineView] = useState(!navigator.onLine);
  const [lastSyncedText, setLastSyncedText] = useState(null);

  const loadOfflineStatus = async () => {
    try {
      const offlineList = await getOfflineExams();
      setOfflineExamIds(new Set(offlineList.map((e) => String(e._id))));
      const meta = await getMeta();
      if (meta?.lastSyncedAt) {
        setLastSyncedText(new Date(meta.lastSyncedAt).toLocaleString());
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadOfflineStatus();
  }, []);

  useEffect(() => {
    let mounted = true;
    async function fetchExams() {
      setLoading(true);
      try {
        if (!navigator.onLine) {
          throw new Error('Offline');
        }
        const data = await apiAuth(`${BASE}/api/alumni-exams/available`);
        if (!mounted) return;
        setExams(Array.isArray(data.exams) ? data.exams : []);
        setIsOfflineView(false);
      } catch (err) {
        if (!mounted) return;
        // Fall back to offline cached exams
        const offlineList = await getOfflineExams();
        setExams(offlineList || []);
        setIsOfflineView(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchExams();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDownloadAll = async () => {
    if (downloading || !navigator.onLine) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadStatus('Connecting to server...');

    try {
      setDownloadStatus('Fetching bulk exam package...');
      const data = await apiAuth(`${BASE}/api/alumni-exams/offline-package`);

      const packageExams = data.exams || [];
      const imageManifest = data.imageManifest || [];
      const ticket = data.offlineSyncTicket;

      // 1. Save exams structure
      setDownloadStatus(`Saving ${packageExams.length} exams locally...`);
      await saveOfflineExams(packageExams);

      // 2. Save ticket to profile
      const profile = await getOfflineProfile();
      await saveOfflineProfile(profile?.me, ticket);

      // 3. Download image manifest with byte tracking
      let totalBytes = 0;
      const totalImages = imageManifest.length;
      const token = getStoredAuthToken();

      for (let i = 0; i < totalImages; i++) {
        const imgKey = imageManifest[i];
        setDownloadStatus(`Downloading images: ${i + 1}/${totalImages} (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)...`);

        try {
          const absUrl = imgKey.startsWith('/') ? `${BASE}${imgKey}` : imgKey;
          const res = await fetch(absUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const blob = await res.blob();
            totalBytes += blob.size;
            await saveOfflineImage(imgKey, blob);
          }
        } catch (imgErr) {
          console.warn('Failed to pre-cache image:', imgKey, imgErr);
        }
      }

      // 4. Update metadata
      const nowIso = new Date().toISOString();
      await setMeta('lastSyncedAt', nowIso);
      await setMeta('examCount', packageExams.length);
      await setMeta('totalBytes', totalBytes);

      setLastSyncedText(new Date().toLocaleString());
      await loadOfflineStatus();

      const mbText = (totalBytes / (1024 * 1024)).toFixed(1);
      setDownloadStatus(`Ready! Saved ${packageExams.length} exams and ${totalImages} images (${mbText} MB) for offline testing.`);
      setTimeout(() => setDownloadStatus(null), 6000);
    } catch (err) {
      console.error('Offline download failed:', err);
      setDownloadError(err.message || 'Failed to download offline package');
    } finally {
      setDownloading(false);
    }
  };

  const filteredExams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter((exam) => {
      const matchesSearch = String(exam?.name || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || getExamStatus(exam) === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [exams, search, statusFilter]);

  const statusCounts = useMemo(() => ({
    all: exams.length,
    published: exams.filter((exam) => getExamStatus(exam) === 'published').length,
    ongoing: exams.filter((exam) => getExamStatus(exam) === 'ongoing').length,
  }), [exams]);

  const hasAnyExams = exams.length > 0;
  const hasResults = filteredExams.length > 0;

  return (
    <main className="aae-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Available Exams"
        subtitle="Browse alumni mock board exams for your program. Published exams are visible, while only on-going exams can be answered."
      />

      {/* Offline Download Action Bar */}
      <section
        className="aae-offline-bar"
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📥 Offline Exam Package</span>
            {offlineExamIds.size > 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  background: '#22c55e',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                {offlineExamIds.size} saved offline
              </span>
            )}
            {isOfflineView && (
              <span
                style={{
                  fontSize: '0.75rem',
                  background: '#f59e0b',
                  color: '#ffffff',
                  padding: '2px 8px',
                  borderRadius: '999px',
                }}
              >
                Viewing Offline Cache
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '4px' }}>
            {lastSyncedText
              ? `Last synced: ${lastSyncedText}. Download all questions and images to test with zero internet.`
              : 'Download exams and images once to answer questions without internet connection.'}
          </div>
          {downloadStatus && (
            <div style={{ fontSize: '0.85rem', color: '#fef08a', marginTop: '6px', fontWeight: 600 }}>
              {downloadStatus}
            </div>
          )}
          {downloadError && (
            <div style={{ fontSize: '0.85rem', color: '#fca5a5', marginTop: '6px' }}>
              Error: {downloadError}
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={handleDownloadAll}
            disabled={downloading || !navigator.onLine}
            style={{
              background: navigator.onLine ? '#f59e0b' : '#64748b',
              color: '#ffffff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: navigator.onLine && !downloading ? 'pointer' : 'not-allowed',
              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              transition: 'opacity 0.2s',
              opacity: downloading ? 0.7 : 1,
            }}
          >
            {downloading ? 'Downloading Package...' : offlineExamIds.size > 0 ? '↻ Re-Sync Offline Package' : '⬇ Download All for Offline'}
          </button>
        </div>
      </section>

      <section className="aae-toolbar">
        <div className="aae-status-tabs" role="tablist" aria-label="Exam status filters">
          {[
            ['all', 'All'],
            ['published', 'Published'],
            ['ongoing', 'On-going'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`aae-status-tab ${statusFilter === key ? 'active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              <span>{label}</span>
              <strong>{statusCounts[key]}</strong>
            </button>
          ))}
        </div>
        <SearchBar
          value={search}
          onChange={setSearch}
          className="aae-search"
          placeholder="Search exams..."
          ariaLabel="Search exams"
        />
      </section>

      {loading && (
        <section className="aae-grid" aria-label="Loading exams">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} keyId={`skel-${i}`} />
          ))}
        </section>
      )}

      {!loading && !hasAnyExams && (
        <div className="aae-empty" role="status">
          No alumni exams are currently available.
        </div>
      )}

      {!loading && hasAnyExams && !hasResults && (
        <div className="aae-empty" role="status">
          No exams found matching your search.
        </div>
      )}

      {!loading && hasResults && (
        <section className="aae-grid" aria-label="Available alumni exams">
          {filteredExams.map((exam) => {
            const status = getExamStatus(exam);
            const isSavedOffline = offlineExamIds.has(String(exam._id));
            const canTakeExam = isSavedOffline || status === 'ongoing';
            return (
            <article key={exam._id} className={`aae-card aae-card--${status}`}>
              <div className="aae-card-body">
                <div className="aae-card-heading">
                  <div>
                    <h3 className="aae-title">{exam.name}</h3>
                    <div className="aae-subtitle">{exam.program?.name || '-'}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <span className={`aae-status-badge status-${status}`}>{getStatusLabel(status)}</span>
                    {isSavedOffline && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: '#16a34a',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                        }}
                      >
                        ✓ Ready Offline
                      </span>
                    )}
                  </div>
                </div>

                <div className="aae-pills">
                  <div className="aae-pill" title="Duration">
                    <IconClock className="aae-pill-icon" />
                    <span>{exam.isTimed ? formatDuration(exam.timeLimitMinutes) : 'Untimed'}</span>
                  </div>
                  <div className="aae-pill" title="Number of items">
                    <IconList className="aae-pill-icon" />
                    <span>{`${exam.questionCount ?? 0} items`}</span>
                  </div>
                  <div className="aae-pill" title="Exam start date">
                    <IconCalendar className="aae-pill-icon" />
                    <span>{formatStartDateTime(exam.startDateTime)}</span>
                  </div>
                  {exam.endDateTime && (
                    <div className="aae-pill" title="Exam end date">
                      <IconCalendar className="aae-pill-icon" />
                      <span>Until {formatStartDateTime(exam.endDateTime)}</span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="aae-btn"
                disabled={!canTakeExam}
                aria-disabled={!canTakeExam}
                onClick={() => {
                  if (canTakeExam && typeof onTakeExam === 'function') {
                    onTakeExam(exam._id);
                  }
                }}
              >
                {canTakeExam ? 'Take Exam' : 'Not Yet Available'}
              </button>
            </article>
          );
          })}
        </section>
      )}
    </main>
  );
}
