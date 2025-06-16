const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
    expiresIn: "1d",
  });

  res.json({ token });
});

module.exports = router;

const token = jwt.sign(
  {
    id: user._id,
    username: user.username,
    isAdmin: user.isAdmin, // 追加
  },
  JWT_SECRET,
  { expiresIn: "1d" }
);

// 例: ログイン処理
const user = await User.findOne({ username: req.body.username });
if (!user) {
  return res.status(401).send("ユーザーが見つかりません");
}
// ここで user を使ってるから、定義は必要
