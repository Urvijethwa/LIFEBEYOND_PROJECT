// Import mongoose to define schema and interact with MongoDB
const mongoose = require("mongoose");

// Shortcut for schema creation
const Schema = mongoose.Schema;

// Review Schema - stores user feedback for listings
const reviewSchema = new Schema({

    // Text comment written by the user
    comment: {
        type: String,
        required: true // review must include a comment
    },

    // Rating given by user (1 to 5 stars)
    rating: {
        type: Number,
        min: 1,  // minimum rating allowed
        max: 5,  // maximum rating allowed
        required: true
    },

    // Reference to the user who wrote the review
    author: {
        type: Schema.Types.ObjectId,
        ref: "User"
    }
});

// Create Review model
const Review = mongoose.model("Review", reviewSchema);

// Export model so it can be used in routes
module.exports = Review;