const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function testGroq() {
  try {
    console.log('Testing Groq API...');
    
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: "Hello, say hi back!" }],
      model: "llama-3.1-8b-instant",
    });
    
    console.log('✅ Groq API working!');
    console.log('Response:', response.choices[0].message.content);
  } catch (error) {
    console.error('❌ Groq API error:', error.message);
  }
}

testGroq();