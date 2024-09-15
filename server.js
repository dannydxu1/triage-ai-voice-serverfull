require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const { OpenAI } = require('openai');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Set up the OpenAI API with the API key from your environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is healthy' });
});

// Transcribe endpoint
app.post('/transcribe', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  if (!req.cookies.convo) {
    twiml.say(
      {
        voice: "Polly.Joanna-Neural",
      },
      "Hey! I'm Joanna 2.0 from Triage AI. How can I help you?"
    );
  }

  twiml.gather({
    speechTimeout: 'auto',
    speechModel: 'experimental_conversations',
    input: 'speech',
    action: '/respond',
  });

  res.writeHead(200, { 'Content-Type': 'application/xml' });
  res.end(twiml.toString());

  if (!req.cookies.convo) {
    res.cookie('convo', '', { path: '/' });
  }
});

// Respond endpoint
app.post('/respond', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const response = new twilio.Response();

  const cookieValue = req.cookies.convo;
  const cookieData = cookieValue ? JSON.parse(decodeURIComponent(cookieValue)) : null;

  let voiceInput = req.body.SpeechResult;
  const conversation = cookieData?.conversation || [];
  conversation.push({ role: 'user', content: voiceInput });

  const aiResponse = await createChatCompletion(conversation);
  conversation.push({ role: "system", content: aiResponse });

  while (conversation.length > 20) {
    conversation.shift();
  }

  twiml.say({
    voice: "Polly.Joanna-Neural",
  }, aiResponse);

  twiml.redirect({
    method: "POST",
  }, `/transcribe`);

  res.writeHead(200, { 'Content-Type': 'application/xml' });
  res.end(twiml.toString());

  const newCookieValue = encodeURIComponent(JSON.stringify({
    conversation
  }));
  res.cookie('convo', newCookieValue, { path: '/' });
});

// Function to create a chat completion using the OpenAI API
async function createChatCompletion(messages) {
  try {
    const systemMessages = [{
      role: "system",
      content: 'You are a helpful assistant for emergency medical services. Do your best to be considerate but attempt to assess the situation and provide emergency guidance.'
    },
    {
      role: "user",
      content: 'We are having a casual conversation over the telephone so please provide engaging but concise responses.'
    },
    ];
    messages = systemMessages.concat(messages);

    const chatCompletion = await openai.chat.completions.create({
      messages: messages,
      model: 'gpt-4',
      temperature: 0.8,
      max_tokens: 100,
      top_p: 0.9,
      n: 1,
    });

    return chatCompletion.choices[0].message.content;

  } catch (error) {
    console.error("Error during OpenAI API request:", error);
    throw error;
  }
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
