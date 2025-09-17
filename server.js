const express = require('express');
const cors = require('cors');

// Import router + tools from ghl-actions.js
const { router: ghlRoutes, AVAILABLE_TOOLS } = require('./routes/ghl-actions');

const app = express();
app.use(cors());
app.use(express.json());

// Mount all GHL routes under /api/ghl
app.use('/api/ghl', ghlRoutes);

// Tools list (used by ChatGPT MCP)
app.post('/tools/list', (req, res) => {
  const tools = Object.entries(AVAILABLE_TOOLS).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: {
      type: 'object',
      properties: def.optionalParams?.reduce((props, param) => {
        props[param] = { type: 'string' };
        return props;
      }, {}) || {},
      required: def.requiredParams || []
    }
  }));

  res.json({ tools });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    toolCount: Object.keys(AVAILABLE_TOOLS).length,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
