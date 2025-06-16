// hash.js
import bcrypt from "bcrypt";

const run = async () => {
  const hash = await bcrypt.hash("admin123", 10);
  console.log("ハッシュ化パスワード:", hash);
};

run();
