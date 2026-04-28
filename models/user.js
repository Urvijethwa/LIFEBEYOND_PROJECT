// Import mongoose to define schema and interact with MongoDB
const mongoose = require("mongoose");

// Shortcut for schema creation
const Schema = mongoose.Schema;

// User Schema - stores all user account data
const userSchema = new Schema({

    // Username (must be unique)
    username: {
        type: String,
        required: true,   // user must enter username
        unique: true      // prevents duplicate usernames
    },

    // Email address (must also be unique)
    email: {
        type: String,
        required: true,
        unique: true      // prevents multiple accounts with same email
    },

    // Password (stored as HASHED value, not plain text)
    password: {
        type: String,
        required: true
    },

    // Role system (Guest vs Host)
    role: {
        type: String,
        enum: ["guest", "host"], // only these values allowed
        default: "guest"         // default role when user registers
    },

    // Wishlist feature - stores saved listings
    wishlist: [
        {
            type: Schema.Types.ObjectId,
            ref: "Listing" // links to Listing model
        }
    ]
});

// Create User model
const User = mongoose.model("User", userSchema);

// Export model to use in routes
module.exports = User;