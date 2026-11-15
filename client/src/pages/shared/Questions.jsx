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
  // Clamp initialTab: professors can't see the approve tab
  const resolvedInitial = !showApproveTab ? 'my' : initialTab;
  const [activeTab, setActiveTab] = useState(resolvedInitial);

  const myBadge = badgeCounts?.myReturnedOrRejected || 0;
  const approveBadge = badgeCounts?.pendingApprovals || 0;

  const tabBar = (
    <div className="qp-tab-bar" role="tablist" aria-label="Questions sub-tabs">
      <button
        role="tab"
        aria-selected={activeTab === 'my'}
        className={`qp-tab-btn${activeTab === 'my' ? ' is-active' : ''}`}
        onClick={() => setActiveTab('my')}
      >
        My Questions
        {myBadge > 0 && (
          <span className={`qp-tab-badge${activeTab === 'my' ? ' is-active' : ''}`}>
            {myBadge > 99 ? '99+' : myBadge}
          </span>
        )}
      </button>

      {showApproveTab && (
        <button
          role="tab"
          aria-selected={activeTab === 'approve'}
          className={`qp-tab-btn${activeTab === 'approve' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('approve')}
        >
          All Questions
          {approveBadge > 0 && (
            <span className={`qp-tab-badge${activeTab === 'approve' ? ' is-active' : ''}`}>
              {approveBadge > 99 ? '99+' : approveBadge}
            </span>
          )}
        </button>
      )}
    </div>
  );

  if (activeTab === 'approve' && showApproveTab) {
    return (
      <QuestionApprovals
        me={me}
        tabBar={tabBar}
      />
    );
  }

  return (
    <MyQuestions
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
