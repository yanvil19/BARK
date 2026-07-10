const settingsManager = require('../services/settingsManager');

const subscribeToFacultySse = (req, res) => {
  settingsManager.addFacultyClient(req, res);
};

module.exports = { subscribeToFacultySse };
