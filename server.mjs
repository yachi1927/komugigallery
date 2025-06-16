// server.js (ESモジュール形式)
import authRoutes from "./routes/auth.mjs";
import postRoutes from "./routes/posts.mjs";
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";
import { Readable } from "stream";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import cloudinary from "cloudinary";
import User from "./models/User.js";
import Post from "./models/Post.js";

// __dirnameを使うための準備 (ESM用)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dotenv読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use("/auth", authRoutes);
app.use("/posts", postRoutes);

app.use(express.static("public"));

// MongoClientとDBインスタンス用変数
const client = new MongoClient(process.env.MONGODB_URI);
let dbInstance = null;

async function connectDB() {
  if (!dbInstance) {
    await client.connect();
    dbInstance = client.db(process.env.MONGODB_DB_NAME);
    console.log("MongoDB connected");
  }
  return dbInstance;
}

// Multer設定
const storage = multer.memoryStorage();
const upload = multer({ storage });

// JWT関連
const SECRET_KEY = process.env.JWT_SECRET || "your-secret";

// トークンからユーザー情報を取得する関数
function getUserFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET_KEY);
  } catch {
    return null;
  }
}

// 管理者権限チェック用ミドルウェア
function requireAdmin(req, res, next) {
  if (!req.currentUser || !req.currentUser.isAdmin) {
    return res.status(403).send("管理者権限が必要です");
  }
  next();
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// リクエストにcurrentUserをセット
app.use((req, res, next) => {
  req.currentUser = getUserFromToken(req);
  next();
});

// Cloudinary設定
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinaryアップロード関数
function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);
    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: "komugigallery" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    bufferStream.pipe(stream);
  });
}

// Cloudinary public ID抽出
function extractPublicId(url) {
  const parts = url.split("/");
  const publicIdWithExt = parts.slice(-2).join("/");
  return publicIdWithExt.replace(/\.[^/.]+$/, "");
}

// 管理者初期化（MongoDB側でアップサート）
async function initAdminUser() {
  const db = await connectDB();
  await db
    .collection("users")
    .updateOne(
      { username: "admin" },
      { $set: { isAdmin: true } },
      { upsert: true }
    );
}
await initAdminUser();

// 仮ユーザーログイン（簡易版）
const adminUsers = [{ username: "admin", password: "admin123", isAdmin: true }];

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(401).send("ユーザー名またはパスワードが違います");
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).send("ユーザー名またはパスワードが違います");
  }

  const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, SECRET_KEY, {
    expiresIn: "1d",
  });
  res.json({ token });
});

// 画像アップロードAPI
app.post("/upload", upload.array("images", 10), async (req, res) => {
  try {
    const db = await connectDB();
    const tags =
      req.body.tags
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean) || [];
    if (!req.files?.length)
      return res.status(400).send("画像が選択されていません");

    const imageUrls = await Promise.all(
      req.files.map((file) => uploadToCloudinary(file))
    );
    await db
      .collection("images")
      .insertOne({ imageUrls, tags, createdAt: new Date() });

    res.redirect("/gallery.html");
  } catch (err) {
    console.error("アップロードエラー:", err);
    res.status(500).send("アップロードに失敗しました");
  }
});

// 画像削除API（MongoDB imagesコレクション）
app.delete("/delete/:id", requireAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const doc = await db
      .collection("images")
      .findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) return res.status(404).send("画像が見つかりません");

    await Promise.all(
      doc.imageUrls.map((url) =>
        cloudinary.v2.uploader.destroy(extractPublicId(url))
      )
    );
    await db
      .collection("images")
      .deleteOne({ _id: new ObjectId(req.params.id) });

    res.json({ success: true });
  } catch (err) {
    console.error("削除失敗:", err);
    res.status(500).send("削除に失敗しました");
  }
});

// 投稿削除API（Mongoose Postモデル） → ここが新規追加のDELETE /posts/:id
app.delete("/posts/:id", requireAdmin, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send("投稿が見つかりません");

    await Promise.all(
      post.imagePublicIds.map((id) => cloudinary.v2.uploader.destroy(id))
    );
    await Post.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: "投稿を削除しました" });
  } catch (err) {
    console.error("削除エラー:", err);
    res.status(500).send("削除に失敗しました");
  }
});

// ギャラリーデータ取得API
app.get("/gallery-data", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const filter = req.query.tag
      ? { tags: { $elemMatch: { $regex: req.query.tag, $options: "i" } } }
      : {};
    const totalCount = await collection.countDocuments(filter);
    const data = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      posts: data.map((doc) => ({
        id: doc._id.toString(),
        imageUrls: doc.imageUrls,
        tags: doc.tags || [],
        createdAt: doc.createdAt,
      })),
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("データ取得失敗");
  }
});

// タグ一覧取得
app.get("/tags", async (req, res) => {
  try {
    const db = await connectDB();
    const docs = await db
      .collection("images")
      .find({}, { projection: { tags: 1 } })
      .toArray();
    const tagSet = new Set();
    docs.forEach((doc) => doc.tags?.forEach((tag) => tagSet.add(tag)));
    res.json([...tagSet]);
  } catch (err) {
    console.error(err);
    res.status(500).send("タグ取得失敗");
  }
});

// タグ検索API
app.get("/search", async (req, res) => {
  try {
    const db = await connectDB();
    const keyword = (req.query.tag || "").trim();
    if (!keyword) return res.status(400).send("キーワードが必要です");

    const results = await db
      .collection("images")
      .find({ tags: { $elemMatch: { $regex: keyword, $options: "i" } } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    res.json(
      results.map((doc) => ({
        id: doc._id.toString(),
        imageUrls: doc.imageUrls,
        tags: doc.tags || [],
        createdAt: doc.createdAt,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("検索に失敗しました");
  }
});

// タグ更新API
app.post("/update-tags", async (req, res) => {
  try {
    const db = await connectDB();
    const { id, tags } = req.body;
    if (!id || !tags) return res.status(400).send("IDとタグが必要です");

    const updated = await db.collection("images").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        },
      }
    );

    if (updated.matchedCount === 0)
      return res.status(404).send("投稿が見つかりません");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("タグ更新失敗");
  }
});

// タグカテゴリ分類API
app.get("/tag-categories", async (req, res) => {
  try {
    const db = await connectDB();
    // 例: カテゴリ別にタグを分類する処理（実際のカテゴリルールに応じて調整）
    const allTags = await db.collection("images").distinct("tags");
    // カテゴリ分けは仮置き例
    const categories = {
      color: allTags.filter((t) => ["red", "blue", "green"].includes(t)),
      animals: allTags.filter((t) => ["cat", "dog", "bird"].includes(t)),
      others: allTags.filter(
        (t) => !["red", "blue", "green", "cat", "dog", "bird"].includes(t)
      ),
    };
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).send("タグカテゴリ取得失敗");
  }
});

// ルートページなど必要に応じて追加
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 404対応
app.use((req, res) => {
  res.status(404).send("Not Found");
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
