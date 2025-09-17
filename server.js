const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
    
    return response.data;
  } catch (error) {
    throw new Error(`GHL execution failed: ${error.response?.data?.message || error.message}`);
  }
}

// MCP Protocol Endpoints for ChatGPT

// Initialize - ChatGPT calls this first
app.post('/initialize', (req, res) => {
  console.log('📡 ChatGPT initializing MCP connection');
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
  console.log('📋 ChatGPT requesting tool list');
  res.json({
    tools: TOOLS
  });
});

// Call tool - ChatGPT calls this to execute a tool
app.post('/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body.params;
    
    console.log(`🔧 ChatGPT calling tool: ${name}`, args);
    
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
    console.error(`❌ Tool call failed: ${error.message}`);
    
    res.json({
      content: [
        {
          type: "text",
          text: `Error executing ${req.body.params?.name}: ${error.message}`
        }
      ],
      isError: true
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'SmartSquatch ChatGPT MCP Server',
    timestamp: new Date().toISOString(),
    toolCount: TOOLS.length
  });
});

// Keep your chat interface
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/chat.html');
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 SmartSquatch ChatGPT MCP Server running on port ${PORT}`);
  console.log(`📡 Ready for ChatGPT MCP connections`);
  console.log(`🛠️  Available tools: ${TOOLS.length}`);
});
