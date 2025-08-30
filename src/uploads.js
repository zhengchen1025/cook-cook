const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');

const router = express.Router();

// multer: store in memory so we can process with sharp
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// ensure upload dir exists
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// POST /api/uploads
// expects multipart/form-data with field 'file'
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ errors: [{ field: 'file', message: 'No file uploaded' }] });

    // Use sharp to auto-rotate, center-crop and resize to 800x800, and convert to webp
    const filename = `${Date.now()}_${Math.round(Math.random() * 1e6)}.webp`;
    const outPath = path.join(UPLOAD_DIR, filename);

    // pipeline: autoRotate -> extract center square -> resize -> to webp
    // Strategy: first metadata to get width/height, compute center square
    const image = sharp(req.file.buffer);
    const meta = await image.metadata();

    // apply autoRotate
    let pipeline = image.rotate(); // sharp.rotate() with no args applies EXIF-based rotation

    // after rotation, re-get metadata may be needed, but we can do centerCrop with fit 'cover' and position 'centre'
    await pipeline
      .resize(800, 800, { fit: 'cover', position: 'centre' })
      .webp({ quality: 70 })
      .toFile(outPath);

    // build URL to return — adjust host/origin as needed
    // If your server runs behind a proxy or different host, you may want to construct full URL dynamically.
    const baseUrl = (req.protocol || 'http') + '://' + (req.get('host') || 'localhost:4000');
    const url = `${baseUrl}/uploads/${filename}`;

    return res.json({ url });
  } catch (err) {
    console.error('Upload error', err);
    return res.status(500).json({ errors: [{ message: 'Upload failed' }] });
  }
});

module.exports = router;