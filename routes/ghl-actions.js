const express = require('express');
const axios = require('axios');
const router = express.Router();

const GHL_MCP_URL = 'https://services.leadconnectorhq.com/mcp/';

// Force JSON headers
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  next();
});

// Full HighLevel MCP tool list
const AVAILABLE_TOOLS = {
  // Calendars
  'calendars_get-calendar-events': { description: 'Get calendar events', requiredParams: [], optionalParams: ['calendarId', 'userId', 'groupId', 'startTime', 'endTime', 'limit'] },
  'calendars_get-appointment-notes': { description: 'Retrieve appointment notes', requiredParams: ['appointmentId'], optionalParams: [] },

  // Contacts
  'contacts_get-all-tasks': { description: 'Get all tasks for a contact', requiredParams: ['contactId'], optionalParams: [] },
  'contacts_add-tags': { description: 'Add tags to a contact', requiredParams: ['contactId', 'tags'], optionalParams: [] },
  'contacts_remove-tags': { description: 'Remove tags from a contact', requiredParams: ['contactId', 'tags'], optionalParams: [] },
  'contacts_get-contact': { description: 'Fetch contact details', requiredParams: ['contactId'], optionalParams: [] },
  'contacts_update-contact': { description: 'Update a contact', requiredParams: ['contactId'], optionalParams: ['firstName', 'lastName', 'email', 'phone', 'customFields'] },
  'contacts_upsert-contact': { description: 'Update or create a contact', requiredParams: [], optionalParams: ['firstName', 'lastName', 'email', 'phone', 'customFields'] },
  'contacts_create-contact': { description: 'Create a new contact', requiredParams: [], optionalParams: ['firstName', 'lastName', 'email', 'phone', 'customFields'] },
  'contacts_get-contacts': { description: 'Fetch all contacts', requiredParams: [], optionalParams: ['limit', 'skip', 'query'] },

  // Conversations
  'conversations_search-conversation': { description: 'Search/filter/sort conversations', requiredParams: [], optionalParams: ['query', 'limit', 'skip'] },
  'conversations_get-messages': { description: 'Retrieve messages by conversation ID', requiredParams: ['conversationId'], optionalParams: ['limit', 'skip'] },
  'conversations_send-a-new-message': { description: 'Send a message to a conversation thread', requiredParams: ['conversationId', 'message'], optionalParams: ['type'] },

  // Locations
  'locations_get-location': { description: 'Get location details', requiredParams: [], optionalParams: [] },
  'locations_get-custom-fields': { description: 'Retrieve custom fields', requiredParams: [], optionalParams: [] },

  // Opportunities
  'opportunities_search-opportunity': { description: 'Search for opportunities', requiredParams: [], optionalParams: ['query', 'pipelineId', 'stageId', 'limit', 'skip'] },
  'opportunities_get-pipelines': { description: 'Fetch pipelines', requiredParams: [], optionalParams: [] },
  'opportunities_get-opportunity': { description: 'Fetch opportunity details', requiredParams: ['opportunityId'], optionalParams: [] },
  'opportunities_update-opportunity': { description: 'Update opportunity details', requiredParams: ['opportunityId'], optionalParams: ['name', 'stageId', 'status', 'value', 'source'] },

  // Payments
  'payments_get-order-by-id': { description: 'Fetch payment order details', requiredParams: ['orderId'], optionalParams: [] },
  'payments_list-transactions': { description: 'List transactions', requiredParams: [], optionalParams: ['limit', 'skip', 'startDate', 'endDate'] }
};

// Validate token once on startup
if (!process.env.GHL_PIT_TOKEN) {
  console.error('❌ GHL_PIT_TOKEN environment variable is missing');
}

// Execute tool
router.post('/execute', async (req, res) => {
  try {
    const { tool, parameters, locationId } = req.body;

    if (!tool || !locationId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tool and locationId',
        availableTools: Object.keys(AVAILABLE_TOOLS)
      });
    }

    if (!AVAILABLE_TOOLS[tool]) {
      return res.status(400).json({
        success: false,
        error: `Tool '${tool}' not found`,
        availableTools: Object.keys(AVAILABLE_TOOLS)
      });
    }

    const headers = {
      'Authorization': `Bearer ${process.env.GHL_PIT_TOKEN}`,
      'locationId': locationId,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'GHL-Gemini-Bridge/1.0.0'
    };

    const requestData = { tool, input: parameters || {} };
    console.log(`📞 Executing ${tool}`, requestData);

    const response = await axios.post(GHL_MCP_URL, requestData, { headers, timeout: 30000 });

    return res.status(200).json({
      success: true,
      tool,
      data: response.data,
      executedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ GHL MCP Error:', error.response?.data || error.message);

    return res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.message || error.message,
      details: error.response?.data || null,
      timestamp: new Date().toISOString()
    });
  }
});

// List tools
router.get('/tools', (req, res) => {
  res.json({
    success: true,
    tools: AVAILABLE_TOOLS,
    totalTools: Object.keys(AVAILABLE_TOOLS).length,
    ghlMcpUrl: GHL_MCP_URL,
    timestamp: new Date().toISOString()
  });
});

// Health
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    configured: !!process.env.GHL_PIT_TOKEN,
    availableTools: Object.keys(AVAILABLE_TOOLS).length,
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Test
router.post('/test', async (req, res) => {
  try {
    const { locationId } = req.body;

    if (!locationId) {
      return res.status(400).json({ success: false, error: 'locationId is required' });
    }

    const testResponse = await axios.post(GHL_MCP_URL, {
      tool: 'locations_get-location',
      input: {}
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GHL_PIT_TOKEN}`,
        'locationId': locationId,
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 10000
    });

    res.json({
      success: true,
      message: 'Connection to GHL MCP successful',
      testTool: 'locations_get-location',
      ghlResponse: testResponse.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Export both
module.exports = {
  router,
  AVAILABLE_TOOLS
};
  router,
  AVAILABLE_TOOLS
};
