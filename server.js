const express = require('express');
const cors = require('cors');
const axios = require('axios');

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

// 🔧 Tools call bridge (MCP requirement)
app.post('/tools/call', async (req, res) => {
  try {
    const { name, arguments: parameters, locationId } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Missing tool name' });
    }

    // Forward request to /api/ghl/execute
    const response = await axios.post(
      `${req.protocol}://${req.get('host')}/api/ghl/execute`,
      { tool: name, parameters, locationId },
      { headers: { 'Content-Type': 'application/json' } }
    );

    res.json(response.data);
  } catch (err) {
    console.error('❌ Error in /tools/call:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.message || err.message
    });
  }
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
