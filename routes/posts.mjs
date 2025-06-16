import express from "express";
import jwt from "jsonwebtoken";
import Post from "../models/Post.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// ミドルウェア: トークン検証
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.sendStatus(401);

  const token = authHeader.split(" ")[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
}

// DELETE /posts/:id
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Not found" });

    // 管理者なら誰でも削除可能。投稿者なら自分の投稿のみ削除可能。
    const isOwner = post.createdBy?.toString() === req.user.id;
    const isAdmin = req.user.isAdmin;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await post.deleteOne();
    res.json({ message: "Deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
