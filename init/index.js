// Load environment variables from .env file (e.g., MongoDB URI)
require("dotenv").config();

// Import mongoose to connect with MongoDB
const mongoose = require("mongoose");

// Import Listing model (used to insert data into DB)
const Listing = require("../models/listing");

// Import sample data from data.js
const initData = require("./data");

// Get MongoDB connection URL from environment variables
const MONGO_URL = process.env.MONGO_URL;

// Function to connect to the database
async function main() {
    // Connect to MongoDB using mongoose
    await mongoose.connect(MONGO_URL);
    console.log("Connected to DB");
}

// Call the main function
main()
    .then(async () => {
        // Delete all existing listings (reset database)
        await Listing.deleteMany({});

        // Insert sample listings into the database
        await Listing.insertMany(initData.data);

        console.log("Database seeded!");

        // Close the database connection after seeding
        mongoose.connection.close();
    })
    .catch((err) => {
        // Handle any connection or insertion errors
        console.log(err);
    });

    //file used for: connect to DB, Delte old data, add