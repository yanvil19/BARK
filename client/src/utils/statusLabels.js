export const getStatusLabel = (status) => {
  const labels = {
    draft: 'Draft',
    published: 'Published',
    finished: 'Finished',
    archived: 'Archived',
    pending_review: 'Pending Review',
    pending_chair: 'Pending Review',
    approved: 'Approved',
    in_draft: 'In Draft',
    in_use: 'In Use',
    retired: 'Retired',
    returned_for_revision: 'Returned for Revision',
    returned: 'Returned for Revision',
    rejected: 'Rejected',
  };
  return labels[status] || status;
};
