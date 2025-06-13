require('dotenv').config(); // .envを読み込む

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000;

const dataFile = path.join(__dirname, 'data.json');

// Cloudinary設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary用multerストレージ設定
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'komugigallery', // Cloudinary上のフォルダ名
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif']
  }
});
const upload = multer({ storage });

// CORS許可
app.use(cors());

// ミドルウェア設定
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 画像アップロード処理
app.post('/upload', upload.array('images', 10), (req, res) => {
  const files = req.files;
  const tags = req.body.tags.split(',').map(t => t.trim()).filter(Boolean);

  if (!files || files.length === 0) {
    return res.status(400).send('画像が選択されていません');
  }

  const imageUrls = files.map(file => file.path); // CloudinaryのURL

  let data = [];
  if (fs.existsSync(dataFile)) {
    data = JSON.parse(fs.readFileSync(dataFile));
  }

  data.push({
    id: Date.now(),
    imageUrls,
    tags
  });

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  res.redirect('/gallery.html');
});

// ギャラリー用データ取得
app.get('/gallery-data', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : [];
  res.json(data);
});

// タグ一覧取得
app.get('/tags', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : [];
  const allTags = new Set();
  data.forEach(item => item.tags.forEach(tag => allTags.add(tag)));
  res.json(Array.from(allTags));
});

// タグ検索
app.get('/search', (req, res) => {
  const keyword = req.query.tag?.toLowerCase() || '';
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : [];

  const results = data.filter(item =>
    item.tags.some(tag => tag.toLowerCase().includes(keyword))
  );
  res.json(results);
});

// タグ更新
app.post('/update-tags', (req, res) => {
  const { id, tags } = req.body;
  if (!id || !tags) return res.status(400).send('IDとタグが必要です');

  let data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : [];
  const index = data.findIndex(item => item.id === id);
  if (index === -1) return res.status(404).send('投稿が見つかりません');

  data[index].tags = tags.split(',').map(t => t.trim()).filter(Boolean);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// タグカテゴリー分け
app.get('/tag-categories', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : [];
  const allTags = new Set();
  data.forEach(item => item.tags.forEach(tag => allTags.add(tag)));
  const tagsArray = Array.from(allTags);

  const categoryRules = {
    "CP": ["akiz", "hiar"],
    "Character": ["izumi", "akiyoshi", "aruwo", "hisanobu"],
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

// トップページ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
