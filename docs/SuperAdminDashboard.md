# Super Admin Dashboard Specifications

## Overview
The Super Admin Dashboard serves as the central command center for the NU-BOARD platform. Its primary purpose is system-wide monitoring, user management, and infrastructure oversight.

## Security & Confidentiality
> [!IMPORTANT]
> **Data Privacy Mandate**: The Super Admin is strictly prohibited from viewing the content, images, or answers of any board exam questions. All dashboard metrics must be aggregate metadata (counts/status) only.

## Key Features
1. **System Metrics**:
   - **User Statistics**: Live counts of active users by role.
   - **Pending Requests**: Oversight of student and alumni registration queues.
   - **Question Repository (Metadata)**: Global tracking of Total, Approved, and Pending questions.
2. **Infrastructure Monitoring**:
   - **Database Storage**: Real-time gauge of MongoDB storage usage against the 512MB limit.
3. **Schools & Programs Catalog**:
   - Compact overview of the academic structure.
   - Direct access to the activation/deactivation management suite.

## Planned Enhancements
- **Audit Logs**: Tracking administrative changes (role updates, status toggles) for security auditing.
- **Broadcast Tool**: System-wide announcements for all active users.
- **System Activity Feed**: Metadata-level activity tracking (e.g., "User X submitted a question").
