import express from 'express';
import multer from 'multer';
import cors from 'cors';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Helper function to encode image to base64
function encodeImageToBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return `data:${mimeTypes[mimeType] || 'image/jpeg'};base64,${base64Image}`;
}

// Routes
app.get('/', (req, res) => {
  res.render('index', { title: 'AI Itinerary Generator' });
});

// Generate itinerary endpoint
app.post('/api/generate-itinerary', upload.single('image'), async (req, res) => {
  try {
    const { destination, duration, budget, interests, textInput } = req.body;
    const imageFile = req.file;

    // Build the prompt
    let prompt = `Create a detailed travel itinerary based on the following information:
- Destination: ${destination || 'Not specified'}
- Duration: ${duration || 'Not specified'}
- Budget: ${budget || 'Not specified'}
- Interests: ${interests || 'Not specified'}`;

    if (textInput) {
      prompt += `\n- Additional details: ${textInput}`;
    }

    prompt += `\n\nPlease provide a day-by-day itinerary with:
1. Activities and attractions
2. Estimated costs
3. Transportation suggestions
4. Dining recommendations
5. Accommodation suggestions
6. Tips and important notes

Format the response in a clear, organized manner with proper headings and structure.`;

    // Prepare messages array
    const messages = [];

    // If image is provided, include it in the message
    if (imageFile) {
      const base64Image = encodeImageToBase64(imageFile.path);
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: prompt + "\n\nPlease also consider the attached image when creating the itinerary. The image might show a destination, activity, or provide context for the trip."
          },
          {
            type: "image_url",
            image_url: {
              url: base64Image
            }
          }
        ]
      });
      
      // Clean up uploaded file
      fs.unlinkSync(imageFile.path);
    } else {
      messages.push({
        role: "user",
        content: prompt
      });
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Create chat completion with streaming
    const chatCompletion = await groq.chat.completions.create({
      messages: messages,
      model: "meta-llama/llama-4-maverick-17b-128e-instruct",
      temperature: 1,
      max_tokens: 1024,
      top_p: 1,
      stream: true,
      stop: null
    });

    // Stream the response
    for await (const chunk of chatCompletion) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error generating itinerary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: port,
    groqApiKey: process.env.GROQ_API_KEY ? 'Set' : 'Not set'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

app.listen(port, () => {
  console.log(`🚀 Itinerary generator running on http://localhost:${port}`);
  console.log(`📝 Make sure to set GROQ_API_KEY in your .env file`);
  console.log(`🔑 GROQ API Key: ${process.env.GROQ_API_KEY ? '✅ Set' : '❌ Not set'}`);
});