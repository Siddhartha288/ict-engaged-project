require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const assessmentRoutes = require('./routes/assessments');
const roadmapRoutes = require('./routes/roadmap');
const adminRoutes = require('./routes/admin');
const sectorRoutes = require('./routes/sectors');
const notesRoutes = require('./routes/notes');
const auditRoutes = require('./routes/audit');
const platformRoutes = require('./routes/platform');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

if (!process.env.JWT_SECRET) {
  console.warn('Warning: JWT_SECRET is not set. Set it in .env before using auth.');
}

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'biztransform' });
});

app.use('/api/auth', authRoutes);
app.use('/api', assessmentRoutes);
app.use('/api/assessments', roadmapRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sectors', sectorRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/platform', platformRoutes);

const staticDir = path.join(__dirname, 'public');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({
    message: status === 500 ? 'Internal server error' : err.message,
  });
});

app.listen(PORT, () => {
  console.log(`BizTransform API listening on http://localhost:${PORT}`);
});
