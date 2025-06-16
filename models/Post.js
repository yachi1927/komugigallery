const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  imageUrls: [String],
  tags: [String],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
});

module.exports = mongoose.model("Post", postSchema);
