const app = require('./app');
const { connectDatabase } = require('./config/db');
const { env } = require('./config/env');
const { startTaskReminderWorker } = require('./services/taskReminderService');

const startServer = async () => {
  await connectDatabase();
  startTaskReminderWorker();

  app.listen(env.PORT, () => {
    console.log(`Server running on http://localhost:${env.PORT}`);
  });
};

startServer();
