const AppSettings = require('../models/AppSettings');
const PendingSettingUpdate = require('../models/PendingSettingUpdate');

class SettingsManager {
  constructor() {
    this.facultyClients = new Set();
    this.pendingTimeout = null;
    this.currentPendingUpdateId = null;
  }

  addFacultyClient(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Flush headers to establish connection
    res.flushHeaders();

    this.facultyClients.add(res);

    req.on('close', () => {
      this.facultyClients.delete(res);
    });
  }

  broadcastToFaculty(event, data) {
    for (const client of this.facultyClients) {
      client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  async init() {
    try {
      const pending = await PendingSettingUpdate.findOne({ status: 'pending' }).sort({ createdAt: -1 });
      if (pending) {
        const now = new Date();
        if (pending.expiresAt > now) {
          // Resume countdown
          const remainingMs = pending.expiresAt.getTime() - now.getTime();
          this.currentPendingUpdateId = pending._id;
          this.pendingTimeout = setTimeout(() => this.applyUpdate(pending._id), remainingMs);
          console.log(`Resumed pending settings update countdown. Applying in ${Math.round(remainingMs / 1000)}s`);
        } else {
          // Time passed while server was down, apply immediately
          console.log('Pending settings update expired while server was down. Applying immediately.');
          await this.applyUpdate(pending._id);
        }
      }
    } catch (err) {
      console.error('Error initializing settings manager:', err);
    }
  }

  async startCountdown(payload, adminId) {
    if (this.currentPendingUpdateId) {
      throw new Error('An update is already pending.');
    }

    const expiresAt = new Date(Date.now() + 60 * 1000); // 1 minute from now

    const pending = new PendingSettingUpdate({
      settingsPayload: payload,
      expiresAt,
      initiatedBy: adminId,
    });
    await pending.save();

    this.currentPendingUpdateId = pending._id;
    this.pendingTimeout = setTimeout(() => this.applyUpdate(pending._id), 60 * 1000);

    this.broadcastToFaculty('update_warning', { expiresAt: pending.expiresAt });
    return pending;
  }

  async cancelCountdown() {
    if (!this.currentPendingUpdateId) {
      throw new Error('No pending update to cancel.');
    }

    clearTimeout(this.pendingTimeout);
    this.pendingTimeout = null;

    const pendingId = this.currentPendingUpdateId;
    this.currentPendingUpdateId = null;

    await PendingSettingUpdate.findByIdAndUpdate(pendingId, { status: 'cancelled' });

    this.broadcastToFaculty('update_cancelled', {});
  }

  async applyUpdate(pendingId) {
    try {
      const pending = await PendingSettingUpdate.findById(pendingId);
      if (!pending || pending.status !== 'pending') return;

      const settings = await AppSettings.getSingleton();
      
      const { emailCooldownDays, passwordCooldownDays, maxUploadImages } = pending.settingsPayload;
      if (emailCooldownDays !== undefined) settings.emailCooldownDays = emailCooldownDays;
      if (passwordCooldownDays !== undefined) settings.passwordCooldownDays = passwordCooldownDays;
      if (maxUploadImages !== undefined) settings.maxUploadImages = maxUploadImages;

      await settings.save();
      
      pending.status = 'applied';
      await pending.save();

      this.currentPendingUpdateId = null;
      this.pendingTimeout = null;

      this.broadcastToFaculty('update_applied', {});
      console.log('Pending settings update applied successfully.');
    } catch (err) {
      console.error('Error applying pending update:', err);
      this.currentPendingUpdateId = null;
      this.pendingTimeout = null;
    }
  }

  async getPendingStatus() {
    if (!this.currentPendingUpdateId) {
      return { isPending: false };
    }
    const pending = await PendingSettingUpdate.findById(this.currentPendingUpdateId);
    if (!pending || pending.status !== 'pending') {
      return { isPending: false };
    }
    return {
      isPending: true,
      expiresAt: pending.expiresAt,
      payload: pending.settingsPayload
    };
  }
}

const settingsManager = new SettingsManager();
module.exports = settingsManager;
