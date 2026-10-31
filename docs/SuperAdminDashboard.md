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

## System Metrics Page
A separate **System Metrics** page (navbar, between User Management and Settings) covers live system health. It reads `GET /api/stats/system-metrics?range=1h|24h|7d` and refreshes every 30 seconds.

- **Right now**: users active in the last 5 minutes (by role) and the last 24 hours (from the heartbeat), live SSE connections, server uptime, database response time.
- **Requests** (1h / 24h / 7d): request count, 5xx and 4xx rates, response time percentiles, a requests-by-outcome chart, a response-time chart, and an endpoints table sortable by usage, slowness, or errors.
- **Platform activity** (last 14 days): exam attempts started (students vs alumni) and audit log entries per day.
- **Server**: memory, event loop delay, Node.js version.

### How requests are recorded
- `server/services/requestMetrics.js` times every request and adds it to an in-memory per-minute summary. Every 30 seconds (and on shutdown) the summaries are added to the `requestmetrics` collection, one document per minute.
- Only route patterns are stored (`GET /api/questions/:id`), never raw URLs, IDs, query strings, or request bodies, so the data-privacy mandate above still holds.
- `/`, `/health`, CORS preflights and SSE streams are skipped so uptime pings and long-lived connections don't skew the numbers.
- A TTL index deletes minutes older than 7 days, which keeps the collection small next to the 512MB database limit.
- Response time percentiles are estimated from a fixed latency histogram (10ms to 10s buckets), so they are approximate.
- Each server instance records its own traffic; documents are updated with `$inc`, so several instances add up correctly.

## Planned Enhancements
- **Audit Logs**: Tracking administrative changes (role updates, status toggles) for security auditing.
- **Broadcast Tool**: System-wide announcements for all active users.
- **System Activity Feed**: Metadata-level activity tracking (e.g., "User X submitted a question").
