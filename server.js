const express = require('express');
const cors = require('cors');
const { router: ghlRoutes, AVAILABLE_TOOLS } = require('./routes/ghl-actions');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root health check
app.get('/', (req, res) => {
  res.json({
    status: 'GHL-Gemini Bridge Active',
    timestamp: new Date().toISOString(),
    endpoints: ['/health', '/tools/list', '/tools/call', '/api/ghl/*']
  });
});

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tools: Object.keys(AVAILABLE_TOOLS).length,
    configured: !!process.env.GHL_PIT_TOKEN,
    timestamp: new Date().toISOString()
  });
});

// MCP Tools List - FIXED VERSION
app.post('/tools/list', (req, res) => {
  try {
    const tools = Object.entries(AVAILABLE_TOOLS).map(([name, config]) => {
      const properties = {};
      
      // Helper function to get proper parameter types
      const getParamType = (paramName) => {
        if (['limit', 'skip'].includes(paramName)) {
          return { type: "integer", description: `Number for ${paramName}` };
        }
        if (paramName === 'tags') {
          return { 
            type: "array", 
            items: { type: "string" },
            description: "Array of tag names"
          };
        }
        if (paramName === 'customFields') {
          return { 
            type: "object",
            description: "Custom field key-value pairs"
          };
        }
        return { 
          type: "string",
          description: `${paramName} parameter`
        };
      };
      
      // Add ALL required parameters to properties
      config.requiredParams.forEach(param => {
        properties[param] = {
          ...getParamType(param),
          description: `Required: ${getParamType(param).description}`
        };
      });
      
      // Add optional parameters to properties
      config.optionalParams.forEach(param => {
        properties[param] = {
          ...getParamType(param),
          description: `Optional: ${getParamType(param).description}`
        };
      });
      
      return {
        name,
        description: config.description,
        inputSchema: {
          type: "object",
          properties,
          required: config.requiredParams || []
        }
      };
    });
    
    res.json({ tools });
  } catch (error) {
    console.error('Tools list error:', error);
    res.status(500).json({ error: error.message });
  }
});

// MCP Tool Call - FIXED VERSION  
app.post('/tools/call', async (req, res) => {
  try {
    console.log('=== MCP TOOL CALL ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Headers:', req.headers);
    
    const { name, arguments: args } = req.body;
    
    if (!name) {
      return res.status(400).json({
        content: [{
          type: "text",
          text: "Error: Tool name is required"
        }]
      });
    }
    
    // Check if tool exists
    if (!AVAILABLE_TOOLS[name]) {
      return res.status(400).json({
        content: [{
          type: "text", 
          text: `Error: Tool '${name}' not found. Available tools: ${Object.keys(AVAILABLE_TOOLS).join(', ')}`
        }]
      });
    }
    
    // Get location ID from environment or arguments
    const locationId = process.env.GHL_LOCATION_ID || args?.locationId;
    
    if (!locationId) {
      return res.status(400).json({
        content: [{
          type: "text",
          text: "Error: locationId is required (set GHL_LOCATION_ID environment variable or pass in arguments)"
        }]
      });
    }
    
    console.log(`Executing tool: ${name} with locationId: ${locationId}`);
    
    // Call your internal GHL execute endpoint
    const executeResponse = await fetch(`${req.protocol}://${req.get('host')}/api/ghl/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tool: name,
        parameters: args || {},
        locationId: locationId
      })
    });
    
    const result = await executeResponse.json();
    
    // Return in MCP format
    if (result.success) {
      res.json({
        content: [{
          type: "text",
          text: JSON.stringify(result.data, null, 2)
        }]
      });
    } else {
      res.status(500).json({
        content: [{
          type: "text",
          text: `Error executing ${name}: ${result.error}`
        }]
      });
    }
    
  } catch (error) {
    console.error('MCP tool call error:', error);
    res.status(500).json({
      content: [{
        type: "text",
        text: `Internal error: ${error.message}`
      }]
    });
  }
});

// Mount GHL routes
app.use('/api/ghl', ghlRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: ['/health', '/tools/list', '/tools/call', '/api/ghl/*']
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GHL-Gemini Bridge running on port ${PORT}`);
  console.log(`📋 Available tools: ${Object.keys(AVAILABLE_TOOLS).length}`);
  console.log(`🔑 GHL Token configured: ${!!process.env.GHL_PIT_TOKEN}`);
  console.log(`📍 Default Location ID: ${process.env.GHL_LOCATION_ID || 'Not set'}`);
});
