const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `voice-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /mp3|wav|m4a|ogg|flac|webm|mp4|mpeg|mpga/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  
  if (extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: fileFilter
});

module.exports = upload;