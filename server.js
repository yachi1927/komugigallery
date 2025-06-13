require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const dataFile = path.join(__dirname, 'data.json');

// Cloudinary設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// CORS許可
app.use(cors());

// 静的ファイル配信(publicフォルダ)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// multerメモリストレージ設定（ローカル保存なし）
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 画像アップロードAPI
app.post('/upload', upload.array('images', 10), async (req, res) => {
  const tags = req.body.tags
    ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean)
    : [];

  if (!req.files || req.files.length === 0) {
    return res.status(400).send('画像が選択されていません');
  }

  try {
    // Cloudinaryにアップロード
    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);

        const stream = cloudinary.uploader.upload_stream(
          { folder: 'komugigallery' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );

        bufferStream.pipe(stream);
      });
    });

    const imageUrls = await Promise.all(uploadPromises);

    // data.jsonにURLとタグを保存
    let data = [];
    if (fs.existsSync(dataFile)) {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    }

    data.push({
      id: Date.now(),
      imageUrls,
      tags
    });

    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));

    res.json({ success: true, imageUrls });
  } catch (error) {
    console.error(error);
    res.status(500).send('アップロードに失敗しました');
  }
});

// ギャラリー用データ取得API
app.get('/gallery-data', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];
  res.json(data);
});

// ルートページ（index.htmlなどをpublicに置いてください）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
