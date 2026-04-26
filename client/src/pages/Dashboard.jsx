import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/Dashboard.css';
import '../styles/LandingPage.css';

const Dashboard = ({ me, onNavigate }) => {
  const onRoute = onNavigate;

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [adminDepts, setAdminDepts] = useState([]);
  const [adminPrograms, setAdminPrograms] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);

  const [pcStats, setPcStats] = useState(null);
  const [pcLoading, setPcLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectDetails, setSubjectDetails] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes, statsRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
          fetch('http://localhost:5000/api/stats/summary'),
        ]);
        const deptData = await deptRes.json();
        const progData = await progRes.json();
        const statsData = await statsRes.json();
        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setStats(statsData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading landing page data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (departments.length === 0) { setActiveDepartmentId(''); return; }
    const hasActive = departments.some(
      (dept) => String(dept._id) === String(activeDepartmentId)
    );
    if (!hasActive) setActiveDepartmentId(String(departments[0]._id));
  }, [departments, activeDepartmentId]);

  useEffect(() => {
    if (me?.role !== 'super_admin') return;
    let cancelled = false;
    setAdminLoading(true);
    (async () => {
      try {
        const [deptRes, progRes] = await Promise.all([
          apiAuth('/api/admin/catalog/departments?limit=200'),
          apiAuth('/api/admin/catalog/programs?limit=200'),
        ]);
        if (cancelled) return;
        setAdminDepts(deptRes.departments || []);
        setAdminPrograms(progRes.programs || []);
      } catch (err) {
        console.error('Failed to load admin catalog:', err.message);
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

 useEffect(() => {
  console.log('🟡 EFFECT TRIGGERED');
  console.log('🟡 ME INSIDE EFFECT:', me);
  console.log('🟡 ROLE INSIDE EFFECT:', me?.role);

  if (!me) {
    console.log('⛔ No user yet, skipping fetch');
    return;
  }

  if (me.role !== 'program_chair') {
    console.log('⛔ Wrong role:', me.role);
    return;
  }

  console.log('✅ FETCHING PROGRAM CHAIR STATS NOW');

  const fetchPcStats = async () => {
    try {
      const [statsRes, pendingRes] = await Promise.all([
        apiAuth('/api/stats/program-chair/stats'),
        apiAuth('/api/questions/approvals?limit=10'),
      ]);

      console.log('✅ API RESPONSE (stats):', statsRes);
      console.log('✅ API RESPONSE (pending):', pendingRes);

      setPcStats({
        ...statsRes,
        pendingQuestionsCount: pendingRes.questions?.length ?? 0,
      });
      setPendingQuestions(pendingRes.questions || []);
    } catch (err) {
      console.error('❌ FETCH ERROR:', err);
    } finally {
      setPcLoading(false);
    }
  };

  fetchPcStats();
}, [me?.role]);

  useEffect(() => {
    if (me?.role !== 'program_chair') return;
    if (!pcStats?.subjectSuccessRates) return;
    const fetchAiSummary = async () => {
      setAiLoading(true);
      try {
        const res = await apiAuth('/api/program-chair/ai-summary', {
          method: 'POST',
          body: JSON.stringify({ subjectRates: pcStats.subjectSuccessRates }),
        });
        setAiSummary(res.summary || '');
      } catch (err) {
        console.error('Failed to generate AI summary:', err.message);
        setAiSummary('Summary could not be generated at this time.');
      } finally {
        setAiLoading(false);
      }
    };
    fetchAiSummary();
  }, [pcStats, me]);

  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(activeDepartmentId);
  });

  const hashTagColor = (str = '') => {
    const palette = ['#2b3980','#1a6b74','#b96b10','#6b3fa0','#1a7a4a','#8b2252','#2e6da4','#7a4a1a','#3d6b2b','#a04040'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  };

  const getSubjectColor = (val) => {
    if (val >= 75) return '#2b3980';
    if (val >= 50) return '#f5a623';
    return '#e53935';
  };

  const openSubjectModal = async (subject) => {
    setSelectedSubject(subject);
    setSubjectDetails([]);
    setSubjectLoading(true);
    try {
      const res = await apiAuth(`/api/program-chair/subject-details/${encodeURIComponent(subject.label)}`);
      setSubjectDetails(res.questions || []);
    } finally {
      setSubjectLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedSubject(null);
    setSubjectDetails([]);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes, statsRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
          fetch('http://localhost:5000/api/stats/summary')
        ]);
        setDepartments((await deptRes.json()).departments || []);
        setPrograms((await progRes.json()).programs || []);
        setStats(await statsRes.json());
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (me?.role !== 'super_admin') return;
    let cancelled = false;
    setAdminLoading(true);
    (async () => {
      try {
        const [d, p] = await Promise.all([
          apiAuth('/api/admin/catalog/departments?limit=200'),
          apiAuth('/api/admin/catalog/programs?limit=200')
        ]);
        if (!cancelled) {
          setAdminDepts(d.departments || []);
          setAdminPrograms(p.programs || []);
        }
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

  useEffect(() => {
    if (me?.role !== 'program_chair') return;
    (async () => {
      try {
        const [statsRes, pendingRes] = await Promise.all([
          apiAuth('/api/program-chair/stats'),
          apiAuth('/api/program-chair/pending-questions?limit=10')
        ]);
        setPcStats(statsRes);
        setPendingQuestions(pendingRes.questions || []);
      } finally {
        setPcLoading(false);
      }
    })();
  }, [me]);

  useEffect(() => {
    if (me?.role !== 'program_chair' || !pcStats?.subjectSuccessRates) return;
    setAiLoading(true);
    apiAuth('/api/program-chair/ai-summary', {
      method: 'POST',
      body: JSON.stringify({ subjectRates: pcStats.subjectSuccessRates })
    }).then(r => setAiSummary(r.summary || '')).finally(() => setAiLoading(false));
  }, [pcStats, me]);

  if (!me) {
    return <main />;
  }

  if (me.role === 'program_chair') {
    const greeting = ['Good Morning','Good Afternoon','Good Evening'][Math.min(2, Math.floor(new Date().getHours()/6))];
    const subjectRates = pcStats?.subjectSuccessRates || [];

    return (
      <main className="dashboard-pc-main">
        <header className="dashboard-pc-header">
          <h1>{greeting}, Program Chair {me.firstName}</h1>
          <p>{me.department?.school?.name || me.department?.name || 'School not assigned'}</p>
        </header>

        {pcLoading ? (
          <div className="pc-loading">Loading dashboard data...</div>
        ) : (
          <>
            <section className="dashboard-table-section-pc">
              <div className="table-section-header-pc">
                <div>
                  <h2>Questions for Review and Approval</h2>
                  <p>These questions are currently being reviewed or are pending approval</p>
                </div>
                <div className="pc-review-header-right">
                  <span className="pc-see-all" onClick={() => onRoute('chairApprovals')}>See all</span>
                  <div className="pc-pending-badge">
                    <span className="pc-pending-number">{pcStats?.pendingQuestionsCount ?? 0}</span>
                    <span className="pc-pending-label">Pending</span>
                  </div>
                </div>
              </div>

              <table className="modern-table-pc">
                <colgroup>
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '50%' }} />
                  <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Question</th>
                    <th>Review Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingQuestions.map((q, i) => (
                    <tr key={i}>
                      <td><span className="pill" style={{ backgroundColor: hashTagColor(q.tag), color: '#fff' }}>{q.tag}</span></td>
                      <td>{q.questionText}</td>
                      <td>
                        <div className="pc-action-buttons">
                          <button className="pc-btn pc-btn-approve">Approve</button>
                          <button className="pc-btn pc-btn-revision">Revision</button>
                          <button className="pc-btn pc-btn-discard">Discard</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pc-table-notice">
                Showing 10 of {pcStats?.pendingQuestionsCount ?? 0} pending questions.
                <button className="pc-notice-link" onClick={() => onRoute('chairApprovals')}>
                  Go to Approve Questions →
                </button>
              </div>
            </section>
          </>
        )}

        {selectedSubject && (
          <div className="pc-modal-overlay" onClick={closeModal}>
            <div className="pc-modal" onClick={e => e.stopPropagation()}>
              <div className="pc-modal-header">
                <h2><span>{selectedSubject.value}%</span> {selectedSubject.label}</h2>
                <button onClick={closeModal}>✕</button>
              </div>
              <div className="pc-modal-body">
                {subjectLoading ? <p>Loading…</p> : (
                  <table className="modern-table">
                    <tbody>
                      {subjectDetails.map((d, i) => (
                        <tr key={i}>
                          <td>{d.questionId}</td>
                          <td>{d.failCount}/{d.totalStudents} failed</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return <main />;
};

export default Dashboard;