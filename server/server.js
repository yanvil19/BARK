const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./app');
const connectDB = require('./config/db');

async function start() {
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });

    const failFast = process.env.DB_FAIL_FAST === 'true' || process.env.NODE_ENV === 'production';

    const connectWithRetry = async () => {
        try {
            await connectDB();
            const { startExamExpiryJob } = require('./services/examExpiryJob');
            const settingsManager = require('./services/settingsManager');
            startExamExpiryJob();
            await settingsManager.init();
        } catch (err) {
            console.error(err);
            if (failFast) {
                process.exit(1);
            }
            setTimeout(connectWithRetry, 10_000);
        }
    };

    connectWithRetry();
}

start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

process.on('uncaughtException', (reason, origin) => {
    console.error('uncaughtException:', reason);
    console.error('Origin:', origin);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('unhandledRejection:', reason);
    console.error('Promise:', promise);
    process.exit(1);
});
