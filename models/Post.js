// models/Post.js
import mongoose from "mongoose";

const postSchema = new mongoose.Schema({
  imageUrls: [String],
  imagePublicIds: [String],
  tags: [String],
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // 投稿者ID
});

const Post = mongoose.model("Post", postSchema);

export default Post;
