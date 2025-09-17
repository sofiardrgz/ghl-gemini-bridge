const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));

// Force JSON response type
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  next();
});

app.use(express.json());
app.use(express.static('.'));

const GHL_MCP_URL = 'https://services.leadconnectorhq.com/mcp/';
const LOCATION_ID = 'Wj3JvHTBsQKqvP85ShhE';

// Import routes
const ghlRoutes = require('./routes/ghl-actions');
app.use('/api/ghl', ghlRoutes);

// Tool definitions
const TOOLS = [
  // Calendars
  {
    name: 'calendars_get-calendar-events',
    description: 'Get calendar events (requires userId, groupId, or calendarId)',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string' },
        userId: { type: 'string' },
        groupId: { type: 'string' },
        startTime: { type: 'string' },
        endTime: { type: 'string' },
        limit: { type: 'number' }
      }
    }
  },
  {
    name: 'calendars_get-appointment-notes',
    description: 'Retrieve appointment notes',
    inputSchema: {
      type: 'object',
      properties: {
        appointmentId: { type: 'string' }
      },
      required: ['appointmentId']
    }
  },

  // Contacts
  { name: 'contacts_get-all-tasks', description: 'Get all tasks for a contact', inputSchema: { type: 'object', properties: { contactId: { type: 'string' } }, required: ['contactId'] } },
  { name: 'contacts_add-tags', description: 'Add tags to a contact', inputSchema: { type: 'object', properties: { contactId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['contactId', 'tags'] } },
  { name: 'contacts_remove-tags', description: 'Remove tags from a contact', inputSchema: { type: 'object', properties: { contactId: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['contactId', 'tags'] } },
  { name: 'contacts_get-contact', description: 'Fetch contact details', inputSchema: { type: 'object', properties: { contactId: { type: 'string' } }, required: ['contactId'] } },
  { name: 'contacts_update-contact', description: 'Update a contact', inputSchema: { type: 'object', properties: { contactId: { type: 'string' }, firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, customFields: { type: 'object' } }, required: ['contactId'] } },
  { name: 'contacts_upsert-contact', description: 'Update or create a contact', inputSchema: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, customFields: { type: 'object' } } } },
  { name: 'contacts_create-contact', description: 'Create a contact', inputSchema: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, customFields: { type: 'object' } } } },
  { name: 'contacts_get-contacts', description: 'Get contacts from GHL', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, skip: { type: 'number' }, query: { type: 'string' } } } },

  // Conversations
  { name: 'conversations_search-conversation', description: 'Search/filter/sort conversations', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' }, skip: { type: 'number' } } } },
  { name: 'conversations_get-messages', description: 'Get messages by conversation ID', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, limit: { type: 'number' }, skip: { type: 'number' } }, required: ['conversationId'] } },
  { name: 'conversations_send-a-new-message', description: 'Send a message to a conversation', inputSchema: { type: 'object', properties: { conversationId: { type: 'string' }, message: { type: 'string' }, type: { type: 'string' } }, required: ['conversationId', 'message'] } },

  // Locations
  { name: 'locations_get-location', description: 'Get location details', inputSchema: { type: 'object', properties: {} } },
  { name: 'locations_get-custom-fields', description: 'Get custom fields for a location', inputSchema: { type: 'object', properties: {} } },

  // Opportunities
  { name: 'opportunities_search-opportunity', description: 'Search for opportunities', inputSchema: { type: 'object', properties: { query: { type: 'string' }, pipelineId: { type: 'string' }, stageId: { type: 'string' }, limit: { type: 'number' }, skip: { type: 'number' } } } },
  { name: 'opportunities_get-pipelines', description: 'Retrieve all pipelines', inputSchema: { type: 'object', properties: {} } },
  { name: 'opportunities_get-opportunity', description: 'Fetch opportunity details', inputSchema: { type: 'object', properties: { opportunityId: { type: 'string' } }, required: ['opportunityId'] } },
  { name: 'opportunities_update-opportunity', description: 'Update an opportunity', inputSchema: { type: 'object', properties: { opportunityId: { type: 'string' }, name: { type: 'string' }, stageId: { type: 'string' }, status: { type: 'string' }, value: { type: 'number' }, source: { type: 'string' } }, required: ['opportunityId'] } },

  // Payments
  { name: 'payments_get-order-by-id', description: 'Fetch order details', inputSchema: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] } },
  { name: 'payments_list-transactions', description: 'List transactions', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, skip: { type: 'number' }, startDate: { type: 'string' }, endDate: { type: 'string' } } } }
];


async function executeGHLTool(toolName, parameters = {}) {
  try {
    console.log(`Executing GHL tool: ${toolName} with params:`, parameters);

    const headers = {
      'Authorization': `Bearer ${process.env.GHL_PIT_TOKEN}`,
      'locationId': LOCATION_ID,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
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

// MCP endpoints
app.post('/initialize', (req, res) => {
  console.log('ChatGPT initializing MCP connection');
  res.status(200).json({
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

app.post('/tools/list', (req, res) => {
  console.log('ChatGPT requesting tool list');
  res.status(200).json({ tools: TOOLS });
});


// Aliases so ChatGPT can send short names like "contacts" instead of "contacts_get-contacts"
const TOOL_ALIASES = {
  // Calendar
  calendars: 'calendars_get-calendar-events',
  calendarEvents: 'calendars_get-calendar-events',
  appointmentNotes: 'calendars_get-appointment-notes',

  // Contacts
  contacts: 'contacts_get-contacts',
  listContacts: 'contacts_get-contacts',
  createContact: 'contacts_create-contact',
  addContact: 'contacts_create-contact',
  getContact: 'contacts_get-contact',
  updateContact: 'contacts_update-contact',
  upsertContact: 'contacts_upsert-contact',
  addTags: 'contacts_add-tags',
  removeTags: 'contacts_remove-tags',
  contactTasks: 'contacts_get-all-tasks',

  // Conversations
  conversations: 'conversations_search-conversation',
  searchConversations: 'conversations_search-conversation',
  getMessages: 'conversations_get-messages',
  sendMessage: 'conversations_send-a-new-message',

  // Opportunities
  opportunities: 'opportunities_search-opportunity',
  searchOpportunities: 'opportunities_search-opportunity',
  getOpportunity: 'opportunities_get-opportunity',
  updateOpportunity: 'opportunities_update-opportunity',
  pipelines: 'opportunities_get-pipelines',

  // Payments
  payments: 'payments_list-transactions',
  transactions: 'payments_list-transactions',
  getOrder: 'payments_get-order-by-id',

  // Locations
  location: 'locations_get-location',
  locationDetails: 'locations_get-location',
  customFields: 'locations_get-custom-fields'
};


// Call tool - ChatGPT calls this to execute a tool
app.post('/tools/call', async (req, res) => {
  try {
    let { name, arguments: args } = req.body.params || {};

    // Map shorthand names to full tool names
    if (TOOL_ALIASES[name]) {
      name = TOOL_ALIASES[name];
    }

    if (!name) {
      return res.status(400).json({
        content: [{ type: "text", text: "Error: Tool name is required" }],
        isError: true
      });
    }

    console.log(`ChatGPT calling tool: ${name}`, args);
    const result = await executeGHLTool(name, args || {});

    res.status(200).json({
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: false
    });
  } catch (error) {
    console.error(`Tool call failed: ${error.message}`);
    res.status(500).json({
      content: [{ type: "text", text: `Error executing ${req.body.params?.name || 'unknown tool'}: ${error.message}` }],
      isError: true
    });
  }
});


// OAuth mock endpoints
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = 'https://ghl-gemini-bridge-1.onrender.com';
  res.status(200).json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    scopes_supported: ["read", "write"]
  });
});

app.get('/oauth/authorize', (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  const authCode = 'mock_auth_code_12345';
  res.redirect(`${redirect_uri}?code=${authCode}&state=${state}`);
});

app.post('/oauth/token', (req, res) => {
  res.status(200).json({
    access_token: 'mock_access_token',
    token_type: 'Bearer',
    expires_in: 3600
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'SmartSquatch ChatGPT MCP Server',
    timestamp: new Date().toISOString(),
    toolCount: TOOLS.length,
    ghlTokenConfigured: !!process.env.GHL_PIT_TOKEN
  });
});

// Chat UI
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(__dirname + '/chat.html');
});

// Test endpoint
app.post('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SmartSquatch server is working',
    timestamp: new Date().toISOString(),
    availableTools: TOOLS.map(t => t.name)
  });
});

// Preflight
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.sendStatus(200);
});

// Error handler
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
