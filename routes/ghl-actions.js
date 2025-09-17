const express = require('express');
const axios = require('axios');
const router = express.Router();

const GHL_MCP_URL = 'https://services.leadconnectorhq.com/mcp/';

// Force JSON response headers for all routes in this router
router.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  next();
});

// Available GHL MCP tools
const AVAILABLE_TOOLS = {
  // Calendar Tools
  'calendars_get-calendar-events': {
    description: 'Get calendar events using userId, groupId, or calendarId',
    requiredParams: ['calendarId OR userId OR groupId'],
    optionalParams: ['startTime', 'endTime', 'limit']
  },
  'calendars_get-appointment-notes': {
    description: 'Retrieve notes for a specific appointment',
    requiredParams: ['appointmentId'],
    optionalParams: []
  },
  
  // Contact Tools
  'contacts_get-all-tasks': {
    description: 'Retrieve all tasks for a contact',
    requiredParams: ['contactId'],
    optionalParams: []
  },
  'contacts_add-tags': {
    description: 'Add tags to a contact',
    requiredParams: ['contactId', 'tags'],
    optionalParams: []
  },
  'contacts_remove-tags': {
    description: 'Remove tags from a contact',
    requiredParams: ['contactId', 'tags'],
    optionalParams: []
  },
  'contacts_get-contact': {
    description: 'Fetch contact details',
    requiredParams: ['contactId'],
    optionalParams: []
  },
  'contacts_update-contact': {
    description: 'Update a contact',
    requiredParams: ['contactId'],
    optionalParams: ['firstName', 'lastName', 'email', 'phone', 'customFields']
  },
  'contacts_upsert-contact': {
    description: 'Update or create a contact',
    requiredParams: [],
    optionalParams: ['firstName', 'lastName', 'email', 'phone', 'customFields']
  },
  'contacts_create-contact': {
    description: 'Create a new contact',
    requiredParams: [],
    optionalParams: ['firstName', 'lastName', 'email', 'phone', 'customFields']
  },
  'contacts_get-contacts': {
    description: 'Fetch all contacts',
    requiredParams: [],
    optionalParams: ['limit', 'skip', 'query']
  },
  
  // Conversation Tools
  'conversations_search-conversation': {
    description: 'Search/filter/sort conversations',
    requiredParams: [],
    optionalParams: ['query', 'limit', 'skip']
  },
  'conversations_get-messages': {
    description: 'Retrieve messages by conversation ID',
    requiredParams: ['conversationId'],
    optionalParams: ['limit', 'skip']
  },
  'conversations_send-a-new-message': {
    description: 'Send a message to a conversation thread',
    requiredParams: ['conversationId', 'message'],
    optionalParams: ['type']
  },
  
  // Location Tools
  'locations_get-location': {
    description: 'Get location details by ID',
    requiredParams: [],
    optionalParams: []
  },
  'locations_get-custom-fields': {
    description: 'Retrieve custom field definitions for a location',
    requiredParams: [],
    optionalParams: []
  },
  
  // Opportunity Tools
  'opportunities_search-opportunity': {
    description: 'Search for opportunities by criteria',
    requiredParams: [],
    optionalParams: ['query', 'pipelineId', 'stageId', 'limit', 'skip']
  },
  'opportunities_get-pipelines': {
    description: 'Fetch all opportunity pipelines',
    requiredParams: [],
    optionalParams: []
  },
  'opportunities_get-opportunity': {
    description: 'Fetch opportunity details by ID',
    requiredParams: ['opportunityId'],
    optionalParams: []
  },
  'opportunities_update-opportunity': {
    description: 'Update opportunity details',
    requiredParams: ['opportunityId'],
    optionalParams: ['name', 'stageId', 'status', 'value', 'source']
  },
  
  // Payment Tools
  'payments_get-order-by-id': {
    description: 'Retrieve payment order details',
    requiredParams: ['orderId'],
    optionalParams: []
  },
  'payments_list-transactions': {
    description: 'Fetch paginated list of transactions',
    requiredParams: [],
    optionalParams: ['limit', 'skip', 'startDate', 'endDate']
  }
};

// Validate environment variables
if (!process.env.GHL_PIT_TOKEN) {
  console.error('❌ GHL_PIT_TOKEN environment variable is required');
}

// Main execution endpoint
router.post('/execute', async (req, res) => {
  try {
    const { tool, parameters, locationId } = req.body;
    
    console.log(`📞 Executing ${tool} for location ${locationId}`);
    
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
        availableTools: Object.keys(AVAILABLE_TOOLS),
        suggestion: 'Use GET /api/ghl/tools to see all available tools'
      });
    }

    if (!process.env.GHL_PIT_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'GHL_PIT_TOKEN not configured on server',
        message: 'Please configure your GoHighLevel Private Integration Token'
      });
    }

    const headers = {
      'Authorization': `Bearer ${process.env.GHL_PIT_TOKEN}`,
      'locationId': locationId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'GHL-Gemini-Bridge/1.0.0'
    };

    const requestData = { tool, input: parameters || {} };

    console.log(`🔄 Making request to GHL MCP:`, { tool, inputKeys: Object.keys(parameters || {}) });

    const response = await axios.post(GHL_MCP_URL, requestData, { 
      headers,
      timeout: 30000
    });
    
    console.log(`✅ GHL MCP response received for ${tool}`);
    
    res.status(200).json({
      success: true,
      tool,
      executedAt: new Date().toISOString(),
      data: response.data
    });

  } catch (error) {
    console.error('❌ GHL MCP Error:', error.response?.data || error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'Request timeout - GHL MCP server took too long to respond',
        message: 'Please try again in a moment'
      });
    }
    
    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,
        error: 'Authentication failed with GoHighLevel',
        message: 'Please check your Private Integration Token and permissions'
      });
    }
    
    if (error.response?.status === 403) {
      return res.status(403).json({
        success: false,
        error: 'Access forbidden - insufficient permissions',
        message: 'Please check your token scopes in GoHighLevel Private Integrations'
      });
    }

res.status(500).json({
  success: false,
  error: error.response?.data?.message || error.message,
  timestamp: new Date().toISOString()
});

  }
});

// Get available tools
router.get('/tools', (req, res) => {
  res.status(200).json({
    success: true,
    totalTools: Object.keys(AVAILABLE_TOOLS).length,
    tools: AVAILABLE_TOOLS,
    ghlMcpUrl: GHL_MCP_URL,
    timestamp: new Date().toISOString()
  });
});

// Health check
router.get('/health', (req, res) => {
  const isConfigured = !!process.env.GHL_PIT_TOKEN;
  
  res.status(200).json({ 
    status: 'healthy',
    configured: isConfigured,
    timestamp: new Date().toISOString(),
    availableTools: Object.keys(AVAILABLE_TOOLS).length,
    version: '1.0.0'
  });
});

// Test endpoint
router.post('/test', async (req, res) => {
  try {
    const { locationId } = req.body;
    
    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: 'locationId required for test'
      });
    }

    const testResult = await axios.post(GHL_MCP_URL, {
      tool: 'locations_get-location',
      input: {}
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GHL_PIT_TOKEN}`,
        'locationId': locationId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

res.status(200).json({
  success: true,
  message: 'Connection to GHL MCP successful',
  testTool: 'locations_get-location',
  ghlResponse: testResult.data, // add this for more context
  timestamp: new Date().toISOString()
});

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Test failed',
      message: error.response?.data?.message || error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
