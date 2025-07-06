const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { processVoiceMessage } = require('../controllers/chatController');

// Voice chat endpoint
router.post('/voice', upload.single('audio'), processVoiceMessage);

module.exports = router;