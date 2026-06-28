export const getStatusLabel = (status) => {
  const labels = {
    draft: 'Draft',
    published: 'Published',
    ongoing: 'Ongoing',
    finished: 'Finished',
    archived: 'Archived',
    pending_review: 'Pending Review',
    pending_chair: 'Pending Review',
    approved: 'Approved',
    returned_for_revision: 'Returned for Revision',
    returned: 'Returned for Revision',
    rejected: 'Rejected',
  };
  return labels[status] || status;
};
