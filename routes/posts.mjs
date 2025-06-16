import express from "express";
import jwt from "jsonwebtoken";
import Post from "../models/Post.js";
import cloudinary from "cloudinary";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("環境変数 JWT_SECRET が設定されていません");
}

// ミドルウェア: トークン認証
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.sendStatus(401);

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET); // req.user = { id, username, isAdmin }
    next();
  } catch (err) {
    console.error("JWT検証失敗:", err);
    res.status(403).json({ error: "Invalid token" });
  }
}

// DELETE /posts/:id
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "投稿が見つかりません" });

    const isOwner = post.createdBy?.toString() === req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "削除権限がありません" });
    }

    // Cloudinary画像削除
    if (Array.isArray(post.imagePublicIds)) {
      await Promise.all(
        post.imagePublicIds.map((publicId) =>
          cloudinary.v2.uploader.destroy(publicId)
        )
      );
    }

    await post.deleteOne();
    res.json({ message: "投稿を削除しました" });
  } catch (error) {
    console.error("削除エラー:", error);
    res.status(500).json({ error: "サーバーエラーにより削除できませんでした" });
  }
});

export default router;
