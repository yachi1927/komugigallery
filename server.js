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

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Multerメモリストレージ設定
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 画像アップロード
app.post('/upload', upload.array('images', 10), async (req, res) => {
  const tags = req.body.tags ? req.body.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

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

    // data.json に保存
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

    res.redirect('/gallery.html');
  } catch (error) {
    console.error(error);
    res.status(500).send('アップロードに失敗しました');
  }
});

// ギャラリー用データ取得
app.get('/gallery-data', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];
  res.json(data);
});

// タグ一覧取得
app.get('/tags', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];
  const allTags = new Set();
  data.forEach(item => item.tags.forEach(tag => allTags.add(tag)));
  res.json(Array.from(allTags));
});

// タグ検索
app.get('/search', (req, res) => {
  const keyword = req.query.tag?.toLowerCase() || '';
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];

  const results = data.filter(item =>
    item.tags.some(tag => tag.toLowerCase().includes(keyword))
  );
  res.json(results);
});

// タグ更新
app.post('/update-tags', (req, res) => {
  const { id, tags } = req.body;
  if (!id || !tags) return res.status(400).send('IDとタグが必要です');

  let data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];

  const index = data.findIndex(item => item.id === Number(id));
  if (index === -1) return res.status(404).send('投稿が見つかりません');

  data[index].tags = tags.split(',').map(t => t.trim()).filter(Boolean);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// タグカテゴリー分け
app.get('/tag-categories', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : [];
  const allTags = new Set();
  data.forEach(item => item.tags.forEach(tag => allTags.add(tag)));
  const tagsArray = Array.from(allTags);

  const categoryRules = {
    "CP": ["akiz","hiar"],
    "Character": ["izumi","akiyoshi","aruwo","hisanobu"],
    "Date": tagsArray.filter(tag => /\d{4}\/\d{2}/.test(tag) || /\d{4}年/.test(tag))
  };

  function categorizeTags(tags, rules) {
    const categorized = {};
    for (const category in rules) {
      categorized[category] = [];
    }
    categorized["Other"] = [];

    tags.forEach(tag => {
      let found = false;
      for (const category in rules) {
        if (rules[category].includes(tag)) {
          categorized[category].push(tag);
          found = true;
          break;
        }
      }
      if (!found) categorized["Other"].push(tag);
    });

    return categorized;
  }

  const categorizedTags = categorizeTags(tagsArray, categoryRules);
  res.json(categorizedTags);
});

// ルート表示
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
