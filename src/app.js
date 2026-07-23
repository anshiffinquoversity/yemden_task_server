const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const taskStatusRoutes = require('./routes/taskStatusRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { env } = require('./config/env');
const { createCorsOriginHandler } = require('./config/cors');
const { notFound, errorMiddleware } = require('./middleware/errorMiddleware');

const app = express();
app.set('trust proxy', 1);
const uploadsPath = path.resolve(__dirname, '../uploads');
const stableFrontendBuildPath = path.resolve(__dirname, '../frontend_web');
const flutterBuildPath = path.resolve(
  __dirname,
  '../../yemden_task_management/build/web'
);
const frontendBuildPath = fs.existsSync(
  path.join(stableFrontendBuildPath, 'index.html')
)
  ? stableFrontendBuildPath
  : flutterBuildPath;
const frontendIndexPath = path.join(frontendBuildPath, 'index.html');

fs.mkdirSync(uploadsPath, { recursive: true });

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin: createCorsOriginHandler({
      nodeEnv: env.NODE_ENV,
      allowedOrigins: env.CORS_ORIGINS,
    }),
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/uploads', express.static(uploadsPath));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/task-statuses', taskStatusRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);

if (fs.existsSync(frontendIndexPath)) {
  app.use(express.static(frontendBuildPath));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath);
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ message: 'Worqi API is running' });
  });
}

app.use(notFound);
app.use(errorMiddleware);

module.exports = app;
