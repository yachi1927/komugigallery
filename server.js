if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { Readable } = require("stream");
const path = require("path");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// Cloudinary設定
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// MongoDB設定
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let dbInstance = null;

async function connectDB() {
  if (!dbInstance) {
    try {
      await client.connect();
      console.log("MongoDB connected");
      dbInstance = client.db(process.env.MONGODB_DB_NAME); // 一度だけ接続
    } catch (err) {
      console.error("MongoDB connection error:", err);
      throw err;
    }
  }
  return dbInstance;
}
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const storage = multer.memoryStorage();
const upload = multer({ storage });

// 画像アップロード
app.post("/upload", upload.array("images", 10), async (req, res) => {
  try {
    const db = await connectDB();
    const tags = req.body.tags
      ? req.body.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    if (!req.files || req.files.length === 0) {
      return res.status(400).send("画像が選択されていません");
    }

    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const bufferStream = new Readable();
        bufferStream.push(file.buffer);
        bufferStream.push(null);

        const stream = cloudinary.uploader.upload_stream(
          { folder: "komugigallery" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );

        bufferStream.pipe(stream);
      });
    });

    const imageUrls = await Promise.all(uploadPromises);

    const collection = db.collection("images");
    await collection.insertOne({
      imageUrls,
      tags,
      createdAt: new Date(),
    });

    res.redirect("/gallery.html");
  } catch (error) {
    console.error("アップロードエラー:", error);
    res.status(500).send("アップロードに失敗しました");
  }
});

// ギャラリーデータ取得
app.get("/gallery-data", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const data = await collection.find().sort({ createdAt: -1 }).toArray();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("データ取得失敗");
  }
});

// タグ一覧取得
app.get("/tags", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const allDocs = await collection.find({}, { projection: { tags: 1 } }).toArray();
    const allTagsSet = new Set();
    allDocs.forEach((doc) => doc.tags.forEach((tag) => allTagsSet.add(tag)));
    res.json(Array.from(allTagsSet));
  } catch (error) {
    console.error(error);
    res.status(500).send("タグ取得失敗");
  }
});

// タグ検索
app.get("/search", async (req, res) => {
  try {
    const db = await connectDB();
    const keyword = (req.query.tag || "").toLowerCase();
    const collection = db.collection("images");

    const data = await collection
      .find({
        tags: { $elemMatch: { $regex: keyword, $options: "i" } },
      })
      .toArray();

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send("検索失敗");
  }
});

// タグ更新
app.post("/update-tags", async (req, res) => {
  try {
    const db = await connectDB();
    const { id, tags } = req.body;
    if (!id || !tags) {
      return res.status(400).send("IDとタグが必要です");
    }

    const collection = db.collection("images");
    const newTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { tags: newTags } }
    );

    if (result.matchedCount === 0)
      return res.status(404).send("投稿が見つかりません");

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send("タグ更新失敗");
  }
});

// タグカテゴリー取得
app.get("/tag-categories", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const allDocs = await collection.find({}, { projection: { tags: 1 } }).toArray();
    const allTagsSet = new Set();
    allDocs.forEach((doc) => doc.tags.forEach((tag) => allTagsSet.add(tag)));
    const tagsArray = Array.from(allTagsSet);

    const categoryRules = {
      CP: ["akiz", "hiar", "szak", "kmkt","nekochan","kiroro"],
      Character: [
        "izumi",
        "akiyoshi",
        "aruwo",
        "hisanobu",
        "akiko",
        "suzui",
        "kotori",
        "kumaki",
      ],
      Date: tagsArray.filter(
        (tag) => /\d{4}\/\d{2}/.test(tag) || /\d{4}年/.test(tag)
      ),
    };

    function categorizeTags(tags, rules) {
      const categorized = {};
      for (const category in rules) {
        categorized[category] = [];
      }
      categorized["Other"] = [];

      tags.forEach((tag) => {
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
  } catch (error) {
    console.error(error);
    res.status(500).send("タグカテゴリー取得失敗");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
