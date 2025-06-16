import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./models/User.js"; // UserモデルをESMでimport

async function createAdminUser() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existingAdmin = await User.findOne({ username: "admin" });
  if (existingAdmin) {
    console.log("管理者ユーザーはすでに存在します。");
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash("admin1234", 10);
  const adminUser = new User({
    username: "aruwo",
    password: Mytoo0902,
    isAdmin: true,
  });

  await adminUser.save();
  console.log("管理者ユーザーを作成しました。");
  process.exit(0);
}

createAdminUser().catch(console.error);
