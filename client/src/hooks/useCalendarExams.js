import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { getCalendarRange } from '../utils/calendarUtils.js';

function normalizeRole(role) {
  if (role === 'programChair') return 'program_chair';
  if (role === 'prof') return 'professor';
  return role;
}

function toProgramId(programId) {
  if (!programId) return '';
  if (typeof programId === 'object') {
    if (programId._id) return String(programId._id).trim();
    if (typeof programId.toString === 'function' && programId.toString() !== '[object Object]') {
      return programId.toString().trim();
    }
  }
  const str = String(programId).trim();
  if (str === '[object Object]' || str === 'undefined' || str === 'null') return '';
  return str;
}

// Loads the exams in the calendar month around `date` from the endpoint for the user's role
export function useCalendarExams({ role, programId, date, refreshKey, enabled = true }) {
  const normalizedRole = normalizeRole(role);
  const isDean = normalizedRole === 'dean';
  const isChair = normalizedRole === 'program_chair';
  const isManager = isDean || isChair;
  const effectiveProgramId = useMemo(() => toProgramId(programId), [programId]);
  const visibleRange = useMemo(() => getCalendarRange(date, 'month'), [date]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return undefined;
    let ignore = false;

    async function fetchCalendarExams() {
      if (isDean && !effectiveProgramId) {
        setExams([]);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();

        if (isManager) {
          if (effectiveProgramId) {
            params.set('programId', effectiveProgramId);
          }
          params.set('startRange', visibleRange.start.toISOString());
          params.set('endRange', visibleRange.end.toISOString());
        }

        const path = isDean
          ? `/api/calendar/dean?${params.toString()}`
          : isChair
          ? `/api/calendar/chair?${params.toString()}`
          : '/api/calendar/student';
        const data = await apiAuth(path);
        if (!ignore) setExams(data.exams || []);
      } catch (err) {
        if (!ignore) {
          setError(err.message || 'Failed to load calendar exams.');
          setExams([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchCalendarExams();

    return () => {
      ignore = true;
    };
  }, [enabled, isManager, isDean, isChair, effectiveProgramId, visibleRange.end, visibleRange.start, refreshKey]);

  return {
    exams,
    loading,
    error,
    isManager,
    missingProgram: isDean && !effectiveProgramId,
  };
}
