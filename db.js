// db.js
const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function connectDB() {
  await client.connect();
  console.log('MongoDB connected');
  return client.db('komugigallery');  // 使用DB名
}

module.exports = { connectDB, client };
