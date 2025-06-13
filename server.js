const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

const uploadPath = path.join(__dirname, 'uploads');
const dataFile = path.join(__dirname, 'data.json');

// uploads フォルダを自動作成
fs.mkdirSync(uploadPath, { recursive: true });

// multer設定（複数ファイル）
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.use(express.static('public'));
app.use('/uploads', express.static(uploadPath));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// アップロード処理
app.post('/upload', upload.array('images', 10), (req, res) => {
  const files = req.files;
  const tags = req.body.tags.split(',').map(t => t.trim()).filter(t => t);

  if (!files || files.length === 0) {
    return res.status(400).send('画像が選択されていません');
  }

  const imageUrls = files.map(f => `/uploads/${f.filename}`);

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

  data[index].tags = tags.split(',').map(t => t.trim()).filter(t => t);
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// タグカテゴリー分けAPI
app.get('/tag-categories', (req, res) => {
  const data = fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile)) : [];
  const allTags = new Set();
  data.forEach(item => item.tags.forEach(tag => allTags.add(tag)));
  const tagsArray = Array.from(allTags);

  // ルール定義（必要に応じて変更してください）
  const categoryRules = {
    "CP": ["akiz","hiar"],
    "Character": ["izumi","akiyoshi","aruwo","hisanobu"],
    "Date": tagsArray.filter(tag => /\d{4}\/\d{2}/.test(tag) || /\d{4}年/.test(tag)) // 例: 2021/07 や 2024年
  };

  function categorizeTags(tags, rules) {
    const categorized = {};
    for (const category in rules) {
      categorized[category] = [];
    }
    categorized["Other"] = [];

    tags.forEach(tag => {
      let foundCategory = false;
      for (const category in rules) {
        if (rules[category].includes(tag)) {
          categorized[category].push(tag);
          foundCategory = true;
          break;
        }
      }
      if (!foundCategory) categorized["Other"].push(tag);
    });

    return categorized;
  }

  const categorizedTags = categorizeTags(tagsArray, categoryRules);
  res.json(categorizedTags);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

const cors = require('cors');
app.use(cors());

const express = require('express');
const path = require('path');

// publicフォルダをルートに設定
app.use(express.static(path.join(__dirname, 'public')));

// ルートにアクセスが来たら public/index.html を返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 他のルートが必要ならここに追記
// 例: app.get('/api', ...)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});