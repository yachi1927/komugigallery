import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./models/User.js";

async function createAdminUser() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI が未定義です。");
    process.exit(1);
  }

  await mongoose.connect(uri);

  await User.deleteOne({ username: "admin" });

  const hashedPassword = await bcrypt.hash("admin123", 10);
  const adminUser = new User({
    username: "admin",
    password: hashedPassword,
    isAdmin: true,
  });

  await adminUser.save();
  console.log("✅ 管理者ユーザーを作成しました。");
  process.exit(0);
}

createAdminUser().catch(console.error);
