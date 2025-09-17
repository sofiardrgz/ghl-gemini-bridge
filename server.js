const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Import GHL routes (YOUR EXISTING FILE - KEEP IT)
const ghlRoutes = require('./routes/ghl-actions');
app.use('/api/ghl', ghlRoutes);

// Gemini AI setup with your new API key
const genAI = new GoogleGenerativeAI('AIzaSyAPpbE7BDRAIabsudUnzWKKpE1Sb9s7Blw');
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  tools: [{
    functionDeclarations: [{
      name: "ghl_execute",
      description: "Execute GoHighLevel actions",
      parameters: {
        type: "object",
        properties: {
          tool: { type: "string" },
          parameters: { type: "object" },
          locationId: { type: "string" }
        },
        required: ["tool", "locationId"]
      }
    }]
  }]
});

// Chat endpoint
app.post('/api/ghl-chat', async (req, res) => {
  try {
    const { message } = req.body;
    const locationId = 'Wj3JvHTBsQKqvP85ShhE';
    
    const chat = model.startChat({
      history: [],
      generationConfig: { maxOutputTokens: 8192 }
    });
    
    const result = await chat.sendMessage(`You are a GoHighLevel assistant. User's location ID is ${locationId}. User: ${message}`);
    const response = result.response;
    
    const functionCalls = response.functionCalls();
    
    if (functionCalls && functionCalls.length > 0) {
      for (const functionCall of functionCalls) {
        if (functionCall.name === 'ghl_execute') {
          const { tool, parameters = {} } = functionCall.args;
          
          const ghlResponse = await fetch(`${req.protocol}://${req.get('host')}/api/ghl/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tool,
              parameters,
              locationId
            })
          });
          
          const ghlResult = await ghlResponse.json();
          
          const followUp = await chat.sendMessage([{
            functionResponse: {
              name: functionCall.name,
              response: ghlResult
            }
          }]);
          
          return res.json({ response: followUp.response.text() });
        }
      }
    }
    
    res.json({ response: response.text() });
    
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/chat.html');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
