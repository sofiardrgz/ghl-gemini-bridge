// live-gemini-ghl-integration.js
// PRODUCTION READY - Live integration with Gemini API

const { GoogleGenerativeAI } = require('@google/generative-ai');

class LiveGeminiGHLIntegration {
  constructor(geminiApiKey, renderServerUrl, locationId) {
    this.geminiApiKey = geminiApiKey;
    this.renderServerUrl = renderServerUrl;
    this.locationId = locationId;
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
    
    // Function definition for Gemini
    this.ghlFunction = {
      name: "ghl_execute",
      description: "Execute any GoHighLevel action. Available tools: contacts_get-contacts (list contacts), contacts_create-contact (create contact), contacts_get-contact (get specific contact), opportunities_search-opportunity (find deals), conversations_search-conversation (find conversations), payments_list-transactions (list payments), calendars_get-calendar-events (get appointments), and more.",
      parameters: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            description: "The GHL MCP tool name (e.g. 'contacts_get-contacts')"
          },
          parameters: {
            type: "object",
            description: "Parameters for the tool (varies by tool)",
            properties: {
              contactId: { type: "string" },
              limit: { type: "integer" },
              query: { type: "string" },
              firstName: { type: "string" },
              lastName: { type: "string" },
              email: { type: "string" },
              phone: { type: "string" },
              message: { type: "string" },
              conversationId: { type: "string" },
              opportunityId: { type: "string" }
            }
          },
          locationId: {
            type: "string",
            description: "GoHighLevel location ID"
          }
        },
        required: ["tool", "locationId"]
      }
    };

    // Initialize model with function calling
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-pro",
      tools: [{ functionDeclarations: [this.ghlFunction] }]
    });
  }

  // Execute GHL action via your Render server
  async executeGHLAction(tool, parameters = {}) {
    try {
      console.log(`🔄 Executing GHL action: ${tool}`);
      
      const response = await fetch(`${this.renderServerUrl}/api/ghl/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: tool,
          parameters: parameters,
          locationId: this.locationId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'GHL action failed');
      }

      console.log(`✅ GHL action completed: ${tool}`);
      return result.data;
      
    } catch (error) {
      console.error('❌ GHL action failed:', error);
      throw error;
    }
  }

  // Process user message and handle function calls
  async chat(userMessage) {
    try {
      console.log(`💬 Processing: ${userMessage}`);
      
      // Start chat with system instructions
      const chat = this.model.startChat({
        history: [],
        generationConfig: {
          maxOutputTokens: 8192,
        },
      });

      // Send message with system context
      const systemContext = `You are a GoHighLevel assistant. The user's location ID is ${this.locationId}. Always include this locationId when calling functions. Help users interact with their GHL data naturally.`;
      
      const result = await chat.sendMessage(`${systemContext}\n\nUser: ${userMessage}`);
      const response = result.response;

      // Check if Gemini wants to call a function
      const functionCalls = response.functionCalls();
      
      if (functionCalls && functionCalls.length > 0) {
        console.log(`🔧 Function calls detected: ${functionCalls.length}`);
        
        // Process each function call
        const functionResults = [];
        
        for (const functionCall of functionCalls) {
          if (functionCall.name === 'ghl_execute') {
            try {
              const { tool, parameters = {}, locationId } = functionCall.args;
              
              // Execute the GHL action
              const ghlResult = await this.executeGHLAction(tool, parameters);
              
              functionResults.push({
                functionResponse: {
                  name: functionCall.name,
                  response: {
                    success: true,
                    tool: tool,
                    data: ghlResult
                  }
                }
              });
              
            } catch (error) {
              functionResults.push({
                functionResponse: {
                  name: functionCall.name,
                  response: {
                    success: false,
                    error: error.message
                  }
                }
              });
            }
          }
        }

        // Send function results back to Gemini
        const followUpResult = await chat.sendMessage(functionResults);
        return followUpResult.response.text();
        
      } else {
        // No function calls, return direct response
        return response.text();
      }
      
    } catch (error) {
      console.error('❌ Chat error:', error);
      return `Sorry, I encountered an error: ${error.message}`;
    }
  }

  // Test the integration
  async test() {
    console.log('🧪 Testing live integration...');
    
    try {
      // Test server connectivity
      const healthResponse = await fetch(`${this.renderServerUrl}/api/ghl/health`);
      const healthData = await healthResponse.json();
      console.log('✅ Server health:', healthData);
      
      // Test chat functionality
      const chatResponse = await this.chat("Show me all my contacts");
      console.log('✅ Chat response:', chatResponse);
      
      return true;
    } catch (error) {
      console.error('❌ Test failed:', error);
      return false;
    }
  }
}

// Express server to handle user interactions
const express = require('express');
const cors = require('cors');

class GeminiGHLServer {
  constructor(geminiApiKey, renderServerUrl, locationId, port = 4000) {
    this.integration = new LiveGeminiGHLIntegration(geminiApiKey, renderServerUrl, locationId);
    this.app = express();
    this.port = port;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // Main chat endpoint
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required'
          });
        }

        const response = await this.integration.chat(message);
        
        res.json({
          success: true,
          response: response,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Chat endpoint error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'Gemini-GHL Live Integration',
        timestamp: new Date().toISOString()
      });
    });

    // Test endpoint
    this.app.get('/api/test', async (req, res) => {
      try {
        const testResult = await this.integration.test();
        res.json({
          success: testResult,
          message: testResult ? 'All tests passed' : 'Tests failed'
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Serve simple web interface
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>GHL-Gemini Live Chat</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            #chatContainer { border: 1px solid #ddd; height: 400px; overflow-y: scroll; padding: 10px; margin: 20px 0; }
            #messageInput { width: 80%; padding: 10px; }
            #sendButton { width: 15%; padding: 10px; }
            .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
            .user { background-color: #e3f2fd; text-align: right; }
            .assistant { background-color: #f5f5f5; }
          </style>
        </head>
        <body>
          <h1>🚀 GHL-Gemini Live Integration</h1>
          <div id="chatContainer"></div>
          <input type="text" id="messageInput" placeholder="Ask about your GHL data..." />
          <button id="sendButton">Send</button>
          
          <script>
            const chatContainer = document.getElementById('chatContainer');
            const messageInput = document.getElementById('messageInput');
            const sendButton = document.getElementById('sendButton');
            
            async function sendMessage() {
              const message = messageInput.value.trim();
              if (!message) return;
              
              // Add user message
              addMessage(message, 'user');
              messageInput.value = '';
              
              try {
                const response = await fetch('/api/chat', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message })
                });
                
                const data = await response.json();
                
                if (data.success) {
                  addMessage(data.response, 'assistant');
                } else {
                  addMessage('Error: ' + data.error, 'assistant');
                }
              } catch (error) {
                addMessage('Error: ' + error.message, 'assistant');
              }
            }
            
            function addMessage(text, sender) {
              const messageDiv = document.createElement('div');
              messageDiv.className = 'message ' + sender;
              messageDiv.textContent = text;
              chatContainer.appendChild(messageDiv);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            
            sendButton.onclick = sendMessage;
            messageInput.onkeypress = (e) => e.key === 'Enter' && sendMessage();
            
            // Add welcome message
            addMessage('Hi! I can help you with your GoHighLevel data. Try: "Show me all my contacts" or "List my opportunities"', 'assistant');
          </script>
        </body>
        </html>
      `);
    });
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🚀 Live Gemini-GHL integration running on port ${this.port}`);
      console.log(`📱 Web interface: http://localhost:${this.port}`);
      console.log(`🔗 API endpoint: http://localhost:${this.port}/api/chat`);
    });
  }
}

// Usage example
const config = {
  geminiApiKey: 'AIzaSyAXWYXZ8BSybwa_FHXoR1Q27lr-z7ELhNs',
  renderServerUrl: 'https://ghl-gemini-bridge-1.onrender.com', // ← CHANGE THIS LINE
  locationId: 'Wj3JvHTBsQKqvP85ShhE'
};

// Start the live server
const server = new GeminiGHLServer(
  config.geminiApiKey,
  config.renderServerUrl,
  config.locationId
);

server.start();

// Export for use
module.exports = {
  LiveGeminiGHLIntegration,
  GeminiGHLServer
};
