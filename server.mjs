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
import User from "../models/User.js";

// __dirnameを使うための準備 (ESM用)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// dotenv読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use("/auth", authRoutes);
app.use("/posts", postRoutes);


async function main() {
  // MongoClientとDBインスタンス
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

  // Mongoose接続とモデル
  await mongoose.connect(process.env.MONGODB_URI);
  const Post = mongoose.model(
    "Post",
    new mongoose.Schema({
      imageUrls: [String],
      imagePublicIds: [String],
      tags: [String],
      createdAt: { type: Date, default: Date.now },
    })
  );

  // Multer設定
  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  // JWT関連
  const SECRET_KEY = process.env.JWT_SECRET || "your-secret";
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

  // Cloudinaryアップロード
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

  // 管理者初期化
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

  // 仮ユーザーログイン
  const adminUsers = [{ username: "admin", password: "password123", isAdmin: true }];

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

  // アップロード
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

  // 削除
  app.delete("/delete/:id", async (req, res) => {
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

  // Mongooseの投稿削除
  app.post("/delete-post", async (req, res) => {
    const { id, password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(403).send("パスワードが違います");

    try {
      const post = await Post.findById(id);
      if (!post) return res.status(404).send("投稿が見つかりません");

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

  // ギャラリーデータ取得
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

  // タグ一覧
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

  // タグによる検索
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

  // タグカテゴリ分類
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

  // ルート
  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
  });

  // サーバー起動
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

// mainを実行して例外キャッチ
main().catch((err) => {
  console.error("アプリ起動時にエラーが発生しました:", err);
});
