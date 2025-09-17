const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced CORS configuration to fix 406 error
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));

// Middleware to handle Accept headers (fixes 406 error)
app.use((req, res, next) => {
  if (!req.headers.accept || req.headers.accept === '*/*') {
    req.headers.accept = 'application/json, text/event-stream';
  }
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  next();
});

app.use(express.json());
app.use(express.static('.'));

const GHL_MCP_URL = 'https://services.leadconnectorhq.com/mcp/';
const LOCATION_ID = 'Wj3JvHTBsQKqvP85ShhE';

// Import your existing GHL routes
const ghlRoutes = require('./routes/ghl-actions');
app.use('/api/ghl', ghlRoutes);

// Tool definitions for ChatGPT MCP
const TOOLS = [
  {
    name: 'contacts_get-contacts',
    description: 'Get all contacts from GoHighLevel CRM',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of contacts to return' },
        query: { type: 'string', description: 'Search query to filter contacts' }
      }
    }
  },
  {
    name: 'contacts_create-contact',
    description: 'Create a new contact in GoHighLevel',
    inputSchema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' }
      }
    }
  },
  {
    name: 'contacts_get-contact',
    description: 'Get specific contact details by ID',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'Contact ID' }
      },
      required: ['contactId']
    }
  },
  {
    name: 'opportunities_search-opportunity',
    description: 'Search for opportunities and deals in sales pipeline',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results' }
      }
    }
  },
  {
    name: 'conversations_search-conversation',
    description: 'Search conversations and messages',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results' }
      }
    }
  },
  {
    name: 'payments_list-transactions',
    description: 'List payment transactions and order history',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum results' },
        startDate: { type: 'string', description: 'Start date filter (YYYY-MM-DD)' },
        endDate: { type: 'string', description: 'End date filter (YYYY-MM-DD)' }
      }
    }
  },
  {
    name: 'calendars_get-calendar-events',
    description: 'Get calendar events and appointments',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', description: 'Calendar ID' },
        limit: { type: 'number', description: 'Maximum results' }
      }
    }
  }
];

async function executeGHLTool(toolName, parameters = {}) {
  try {
    console.log(`Executing GHL tool: ${toolName} with params:`, parameters);
    
    const headers = {
      'Authorization': `Bearer ${process.env.GHL_PIT_TOKEN}`,
      'locationId': LOCATION_ID,
      'Content-Type': 'application/json'
    };

    const requestData = {
      tool: toolName,
      input: parameters
    };

    const response = await axios.post(GHL_MCP_URL, requestData, { 
      headers,
      timeout: 30000 
    });
    
    console.log(`GHL tool ${toolName} executed successfully`);
    return response.data;
  } catch (error) {
    console.error(`GHL tool ${toolName} failed:`, error.response?.data || error.message);
    throw new Error(`GHL execution failed: ${error.response?.data?.message || error.message}`);
  }
}

// MCP Protocol Endpoints for ChatGPT

// Initialize - ChatGPT calls this first
app.post('/initialize', (req, res) => {
  console.log('ChatGPT initializing MCP connection');
  res.json({
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {}
    },
    serverInfo: {
      name: "SmartSquatch GHL MCP",
      version: "1.0.0"
    }
  });
});

// List tools - ChatGPT calls this to get available tools
app.post('/tools/list', (req, res) => {
  console.log('ChatGPT requesting tool list');
  res.json({
    tools: TOOLS
  });
});

// Call tool - ChatGPT calls this to execute a tool
app.post('/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body.params || {};
    
    if (!name) {
      return res.status(400).json({
        content: [{
          type: "text",
          text: "Error: Tool name is required"
        }],
        isError: true
      });
    }
    
    console.log(`ChatGPT calling tool: ${name}`, args);
    
    const result = await executeGHLTool(name, args || {});
    
    res.json({
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: false
    });
    
  } catch (error) {
    console.error(`Tool call failed: ${error.message}`);
    
    res.json({
      content: [
        {
          type: "text",
          text: `Error executing ${req.body.params?.name || 'unknown tool'}: ${error.message}`
        }
      ],
      isError: true
    });
  }
});

// OAuth configuration endpoint (required by ChatGPT)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = 'https://ghl-gemini-bridge-1.onrender.com';
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    scopes_supported: ["read", "write"]
  });
});

// OAuth authorize endpoint (mock for ChatGPT compatibility)
app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  const authCode = 'mock_auth_code_12345';
  res.redirect(`${redirect_uri}?code=${authCode}&state=${state}`);
});

// OAuth token endpoint (mock for ChatGPT compatibility)
app.post('/oauth/token', (req, res) => {
  res.json({
    access_token: 'mock_access_token',
    token_type: 'Bearer',
    expires_in: 3600
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SmartSquatch ChatGPT MCP Server',
    timestamp: new Date().toISOString(),
    toolCount: TOOLS.length,
    ghlTokenConfigured: !!process.env.GHL_PIT_TOKEN
  });
});

// Keep your chat interface
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/chat.html');
});

// Test endpoint for Custom GPT Actions
app.post('/test', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'SmartSquatch server is working',
      timestamp: new Date().toISOString(),
      availableTools: TOOLS.map(t => t.name)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Handle preflight OPTIONS requests
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.sendStatus(200);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      'GET /',
      'GET /health', 
      'POST /initialize',
      'POST /tools/list',
      'POST /tools/call',
      'POST /api/ghl/execute'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`SmartSquatch ChatGPT MCP Server running on port ${PORT}`);
  console.log(`Ready for ChatGPT MCP connections`);
  console.log(`Available tools: ${TOOLS.length}`);
  console.log(`GHL Token configured: ${!!process.env.GHL_PIT_TOKEN}`);
});

module.exports = app;
