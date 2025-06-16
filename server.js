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

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");

const app = express();
const PORT = process.env.PORT || 3000;

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { v2: cloudinary } = require("cloudinary");

dotenv.config();

app.use(express.json());

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
      dbInstance = client.db(process.env.MONGODB_DB_NAME);
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

// MongoDB shellまたはMongooseで
db.users.updateOne({ username: "admin" }, { $set: { isAdmin: true } });

localStorage.setItem("token", token);

function getUserFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split(".")[1])); // JWTの中身
    return payload; // { id, username, isAdmin }
  } catch (e) {
    return null;
  }
}

const currentUser = getUserFromToken();
const isAdmin = currentUser?.isAdmin;

// MongoDB接続
mongoose.connect("mongodb://localhost:27017/galleryApp");
const Post = mongoose.model(
  "Post",
  new mongoose.Schema({
    imageUrls: [String],
    imagePublicIds: [String],
    tags: [String],
    createdAt: { type: Date, default: Date.now },
  })
);

app.use("/auth", authRoutes);
app.use("/posts", postRoutes);

app.listen(3000, () => console.log("Server running on port 3000"));

const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET || "your-secret";

// 仮のユーザーデータ
const adminUsers = [
  { username: "admin", password: "password123", isAdmin: true },
];

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = adminUsers.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).send("ユーザー名またはパスワードが違います");
  }

  const token = jwt.sign(
    { id: user.username, isAdmin: user.isAdmin },
    SECRET_KEY,
    { expiresIn: "1d" }
  );

  res.json({ token });
});

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

app.delete("/delete/:id", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const { id } = req.params;

    // まずMongoDBから画像データを取得
    const doc = await collection.findOne({ _id: new ObjectId(id) });
    if (!doc) return res.status(404).send("画像が見つかりません");

    // Cloudinaryから画像削除（複数画像対応）
    const deletePromises = doc.imageUrls.map((url) => {
      // 公開IDを抽出（例： https://res.cloudinary.com/xxx/image/upload/v12345678/komugigallery/abc.jpg → komugigallery/abc）
      const parts = url.split("/");
      const publicIdWithExt = parts.slice(-2).join("/"); // komugigallery/abc.jpg
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ""); // 拡張子を除去

      return cloudinary.uploader.destroy(publicId);
    });

    await Promise.all(deletePromises);

    // MongoDBからドキュメント削除
    await collection.deleteOne({ _id: new ObjectId(id) });

    res.json({ success: true });
  } catch (error) {
    console.error("削除失敗:", error);
    res.status(500).send("削除に失敗しました");
  }
});

// 削除API
app.post("/delete-post", async (req, res) => {
  const { id, password } = req.body;

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).send("パスワードが違います");
  }

  try {
    const post = await Post.findById(id);
    if (!post) return res.status(404).send("対象の投稿が見つかりません");

    // Cloudinaryから画像削除
    if (post.imagePublicIds && post.imagePublicIds.length > 0) {
      await Promise.all(
        post.imagePublicIds.map((publicId) =>
          cloudinary.uploader.destroy(publicId)
        )
      );
    }

    // DBから削除
    await Post.findByIdAndDelete(id);

    res.send("削除完了しました");
  } catch (err) {
    console.error("削除エラー:", err);
    res.status(500).send("サーバーエラーで削除できませんでした");
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

// 修正済み ギャラリーデータ取得（タグ絞り込み対応）
app.get("/gallery-data", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // タグ絞り込み条件
    let filter = {};
    if (req.query.tag) {
      // 部分一致かつ大文字小文字無視でタグに一致するものを検索
      filter.tags = { $elemMatch: { $regex: req.query.tag, $options: "i" } };
    }

    const totalCount = await collection.countDocuments(filter);
    const data = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const formatted = data.map((doc) => ({
      id: doc._id.toString(),
      imageUrls: doc.imageUrls,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
    }));

    res.json({
      posts: formatted,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("データ取得失敗");
  }
});

async function loadGallery(page = 1) {
  try {
    const res = await fetch(`/gallery-data?page=${page}`);
    if (!res.ok) throw new Error("ギャラリー取得失敗");
    const json = await res.json();

    displayImages(json.posts, "gallery");

    // ページネーションUIがあれば更新や制御をここに書く
    console.log(`ページ${json.currentPage} / ${json.totalPages}`);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
}

// 以下、元コードのまま
app.get("/tags", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const allDocs = await collection
      .find({}, { projection: { tags: 1 } })
      .toArray();
    const allTagsSet = new Set();
    allDocs.forEach((doc) => doc.tags.forEach((tag) => allTagsSet.add(tag)));
    res.json(Array.from(allTagsSet));
  } catch (error) {
    console.error(error);
    res.status(500).send("タグ取得失敗");
  }
});

app.get("/search", async (req, res) => {
  try {
    const db = await connectDB();
    const keyword = (req.query.tag || "").trim();

    if (!keyword) {
      return res.status(400).send("検索キーワードが必要です");
    }

    const collection = db.collection("images");

    const data = await collection
      .find({
        tags: { $elemMatch: { $regex: keyword, $options: "i" } },
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    const formatted = data.map((doc) => ({
      id: doc._id.toString(),
      imageUrls: doc.imageUrls,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).send("検索に失敗しました");
  }
});

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

app.get("/tag-categories", async (req, res) => {
  try {
    const db = await connectDB();
    const collection = db.collection("images");
    const allDocs = await collection
      .find({}, { projection: { tags: 1 } })
      .toArray();
    const allTagsSet = new Set();
    allDocs.forEach((doc) => doc.tags.forEach((tag) => allTagsSet.add(tag)));
    const tagsArray = Array.from(allTagsSet);

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
