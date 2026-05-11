const cron = require('node-cron');
const MockBoardExam = require('../models/MockBoardExam');

const startExamExpiryJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const result = await MockBoardExam.updateMany(
        {
          status: 'published',
          endDateTime: { $lt: new Date() }
        },
        { status: 'finished' }
      );
      if (result.modifiedCount > 0) {
        console.log(`[ExamExpiryJob] ${result.modifiedCount} exam(s) transitioned to finished`);
      }
    } catch (err) {
      console.error('[ExamExpiryJob] Error:', err.message);
    }
  });
};

module.exports = { startExamExpiryJob };
