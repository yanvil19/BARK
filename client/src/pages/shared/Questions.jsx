import React, { useState } from 'react';
import MyQuestions from './MyQuestions.jsx';
import QuestionApprovals from './ApproveQuestions.jsx';

/**
 * Unified Questions page — merges "My Questions" and "Approve Questions"
 * into a single page with sub-tabs.
 *
 * Props:
 *   me            – current user object
 *   role          – 'dean' | 'program_chair' | 'professor'
 *   programId     – selected program id (dean/chair)
 *   programLabel  – display label for the program
 *   programs      – array of programs (dean only)
 *   onProgramChange – callback when dean changes program filter
 *   initialTab    – 'my' | 'approve' (default 'my')
 *   badgeCounts   – { myReturnedOrRejected, pendingApprovals } for badge dots
 */
export default function Questions({
  me,
  role,
  programId,
  programLabel,
  programs,
  onProgramChange,
  initialTab = 'my',
  badgeCounts,
}) {
  const showApproveTab = role === 'dean' || role === 'program_chair';
  const resolvedTab = initialTab === 'approve' ? 'review' : initialTab;
  const resolvedInitial = showApproveTab ? resolvedTab : 'my';
  const [activeTab, setActiveTab] = useState(resolvedInitial);
  const [filterResetKey, setFilterResetKey] = useState(0);

  const myBadge = badgeCounts?.myReturnedOrRejected || 0;
  const approveBadge = badgeCounts?.pendingApprovals || 0;

  const tabBar = showApproveTab ? (
    <div className="qp-tab-bar" role="tablist" aria-label="Question views">
      <button
        role="tab"
        aria-selected={activeTab === 'review'}
        className={`qp-tab-btn${activeTab === 'review' ? ' is-active' : ''}`}
        onClick={() => setActiveTab('review')}
        onDoubleClick={() => setFilterResetKey((key) => key + 1)}
      >
        Review
        {approveBadge > 0 && (
          <span className={`qp-tab-badge${activeTab === 'review' ? ' is-active' : ''}`}>
            {approveBadge > 99 ? '99+' : approveBadge}
          </span>
        )}
      </button>

      <button
        role="tab"
        aria-selected={activeTab === 'my'}
        className={`qp-tab-btn${activeTab === 'my' ? ' is-active' : ''}`}
        onClick={() => setActiveTab('my')}
        onDoubleClick={() => setFilterResetKey((key) => key + 1)}
      >
        My Questions
        {myBadge > 0 && (
          <span className={`qp-tab-badge${activeTab === 'my' ? ' is-active' : ''}`}>
            {myBadge > 99 ? '99+' : myBadge}
          </span>
        )}
      </button>

      <button
        role="tab"
        aria-selected={activeTab === 'all'}
        className={`qp-tab-btn${activeTab === 'all' ? ' is-active' : ''}`}
        onClick={() => setActiveTab('all')}
        onDoubleClick={() => setFilterResetKey((key) => key + 1)}
      >
        All Questions
      </button>
    </div>
  ) : null;

  if ((activeTab === 'review' || activeTab === 'all') && showApproveTab) {
    return (
      <QuestionApprovals
        key={`${activeTab}-${filterResetKey}`}
        me={me}
        tabBar={tabBar}
        initialFilter={activeTab === 'review' ? 'review' : 'library'}
      />
    );
  }

  return (
    <MyQuestions
      key={`my-${filterResetKey}`}
      me={me}
      role={role}
      programId={programId}
      programLabel={programLabel}
      programs={programs}
      onProgramChange={onProgramChange}
      tabBar={tabBar}
    />
  );
}
