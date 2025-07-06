const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');  // Add this
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory - ADD THIS
app.use(express.static(path.join(__dirname, '../frontend')));

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// API Routes
app.use('/api/chat', require('./routes/chat'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Voice chatbot server running' });
});

// Serve frontend for root path - ADD THIS
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`Voice chatbot server running on port ${PORT}`);
});