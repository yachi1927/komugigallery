// server.js (ESモジュール形式)
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

// __dirnameを使うための準備 (ESM用)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dotenv読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// MongoDBの接続設定（MongoClient & Mongoose両方使用）
const client = new MongoClient(process.env.MONGODB_URI);
let dbInstance = null;
async function connectDB() {
  if (!dbInstance) {
    await client.connect();
    dbInstance = client.db(process.env.MONGODB_DB_NAME);
    console.log("MongoDB connected (MongoClient)");
  }
  return dbInstance;
}

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected (Mongoose)");

// Mongooseモデル定義
const Post = mongoose.model(
  "Post",
  new mongoose.Schema({
    imageUrls: [String],
    imagePublicIds: [String],
    tags: [String],
    createdAt: { type: Date, default: Date.now },
  })
);

// Multer設定（メモリストレージ）
const storage = multer.memoryStorage();
const upload = multer({ storage });

// JWT設定
const SECRET_KEY = process.env.JWT_SECRET || "your-secret";

// JWTからユーザー情報取得
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

// Expressミドルウェア設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

// Cloudinaryアップロード関数（ストリーム使用）
function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const bufferStream = new Readable();
    bufferStream.push(file.buffer);
    bufferStream.push(null);
    const stream = cloudinary.v2.uploader.upload_stream(
      { folder: "komugigallery" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    bufferStream.pipe(stream);
  });
}

// Cloudinary public ID抽出（URLから）
function extractPublicId(url) {
  // 例：https://res.cloudinary.com/demo/image/upload/v1234567/komugigallery/abc123.jpg
  const parts = url.split("/");
  const publicIdWithExt = parts.slice(-2).join("/");
  return publicIdWithExt.replace(/\.[^/.]+$/, "");
}

// 初期管理者ユーザー設定（MongoClientでDB操作）
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

// 仮ユーザーログイン用データ（実運用ではDB参照に変更推奨）
const adminUsers = [{ username: "admin", password: "admin123", isAdmin: true }];

// --- ルート ---
// ログイン
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = adminUsers.find(
    (u) => u.username === username && u.password === password
  );
  if (!user)
    return res.status(401).send("ユーザー名またはパスワードが違います");

  const token = jwt.sign(
    { id: user.username, isAdmin: user.isAdmin },
    SECRET_KEY,
    { expiresIn: "1d" }
  );
  res.json({ token });
});

// 画像アップロード（最大10枚）
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

    // Cloudinaryへアップロードし、結果オブジェクト（url, public_idなど）を取得
    const uploadResults = await Promise.all(
      req.files.map((file) => uploadToCloudinary(file))
    );

    const imageUrls = uploadResults.map((r) => r.secure_url);
    const imagePublicIds = uploadResults.map((r) => r.public_id);

    // MongoDBに保存
    await db.collection("images").insertOne({
      imageUrls,
      imagePublicIds,
      tags,
      createdAt: new Date(),
    });

    res.redirect("/gallery.html");
  } catch (err) {
    console.error("アップロードエラー:", err);
    res.status(500).send("アップロードに失敗しました");
  }
});

// 投稿削除
app.delete("/posts/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const id = req.params.id;

    const post = await db
      .collection("images")
      .findOne({ _id: new ObjectId(id) });
    if (!post) return res.status(404).json({ error: "投稿が見つかりません" });

    // Cloudinary画像削除
    if (Array.isArray(post.imagePublicIds)) {
      await Promise.all(
        post.imagePublicIds.map((publicId) =>
          cloudinary.v2.uploader.destroy(publicId)
        )
      );
    }

    // MongoDBから削除
    await db.collection("images").deleteOne({ _id: new ObjectId(id) });

    res.json({ message: "投稿を削除しました" });
  } catch (err) {
    console.error("削除エラー:", err);
    res.status(500).json({ error: "削除に失敗しました" });
  }
});

// Mongooseモデル(Post)の投稿削除
app.post("/delete-post", async (req, res) => {
  const { id, password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD)
    return res.status(403).send("パスワードが違います");

  try {
    const post = await Post.findById(id);
    if (!post) return res.status(404).send("投稿が見つかりません");

    // Cloudinaryの画像削除
    await Promise.all(
      post.imagePublicIds.map((id) => cloudinary.v2.uploader.destroy(id))
    );

    await Post.findByIdAndDelete(id);

    res.send("削除完了しました");
  } catch (err) {
    console.error("削除エラー:", err);
    res.status(500).send("削除できませんでした");
  }
});

// ギャラリーデータ取得（ページネーション付き）
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
    docs.forEach((doc) => {
      if (Array.isArray(doc.tags)) {
        doc.tags.forEach((tag) => tagSet.add(tag));
      }
    });

    res.json([...tagSet]);
  } catch (err) {
    console.error("タグ取得エラー:", err);
    res.status(500).json({ error: "タグの取得に失敗しました" });
  }
});

// タグ検索
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

// タグ更新
app.post("/update-tags", async (req, res) => {
  try {
    const db = await connectDB();
    const { id, tags } = req.body;

    // ✅ 配列であることを確認
    if (!id || !Array.isArray(tags))
      return res.status(400).json({ error: "IDとタグ配列が必要です" });

    // ✅ 不正な文字列や空白を除去
    const tagArray = tags.map((t) => t.trim()).filter(Boolean);

    const result = await db
      .collection("images")
      .updateOne({ _id: new ObjectId(id) }, { $set: { tags: tagArray } });

    if (result.matchedCount === 0)
      return res.status(404).json({ error: "該当投稿が見つかりません" });

    res.json({ message: "タグを更新しました", tags: tagArray });
  } catch (err) {
    console.error("タグ更新エラー:", err);
    res.status(500).json({ error: "タグの更新に失敗しました" });
  }
});

// タグカテゴリ分類取得
app.get("/tag-categories", async (req, res) => {
  try {
    const db = await connectDB();
    const docs = await db
      .collection("images")
      .find({}, { projection: { tags: 1 } })
      .toArray();
    const allTags = new Set();
    docs.forEach((doc) => doc.tags?.forEach((tag) => allTags.add(tag)));

    const categoryRules = {
      CP: ["akiz", "hiar", "szak", "kmkt"],
      Character: [
        "izumi",
        "akiyoshi",
        "aruwo",
        "hisanobu",
        "akiko",
        "suzui",
        "kotori",
        "kumaki",
        "rei",
        "nekochan",
        "kiroro",
        "hironobu",
        "hitoya",
        "kuko",
        "jyushi",
        "hainekochan",
        "toranekochan",
        "yoshihisa",
      ],
    };

    const categorized = {
      CP: [],
      Character: [],
      Date: [...allTags].filter((tag) => /\d{4}\/\d{2}|\d{4}年/.test(tag)),
      Other: [],
    };

    for (const tag of allTags) {
      let matched = false;
      for (const [category, list] of Object.entries(categoryRules)) {
        if (list.includes(tag)) {
          categorized[category].push(tag);
          matched = true;
        }
      }
      if (!matched && !categorized["Date"].includes(tag)) {
        categorized["Other"].push(tag);
      }
    }

    res.json(categorized);
  } catch (err) {
    console.error(err);
    res.status(500).send("タグカテゴリー取得失敗");
  }
});

// ルート（トップページ）
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// サーバ起動
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
