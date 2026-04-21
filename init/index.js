require("dotenv").config();
const mongoose = require("mongoose");
const Listing = require("../models/listing");
const initData = require("./data");

const MONGO_URL = process.env.MONGO_URL;

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log("Connected to DB");
}

main()
  .then(async () => {
    await Listing.deleteMany({});
    await Listing.insertMany(initData.data);
    console.log("Database seeded!");
    mongoose.connection.close();
  })
  .catch((err) => {
    console.log(err);
  });