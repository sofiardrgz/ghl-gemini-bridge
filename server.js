const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
const ghlRoutes = require('./routes/ghl-actions');
app.use('/api/ghl', ghlRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'GHL-Gemini Bridge is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      execute: 'POST /api/ghl/execute',
      tools: 'GET /api/ghl/tools',
      health: 'GET /api/ghl/health'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /',
      'POST /api/ghl/execute',
      'GET /api/ghl/tools',
      'GET /api/ghl/health'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 GHL Token configured: ${process.env.GHL_PIT_TOKEN ? 'Yes' : 'No'}`);
});
