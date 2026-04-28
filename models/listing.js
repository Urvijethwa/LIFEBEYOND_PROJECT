// Import mongoose to define schema and interact with MongoDB
const mongoose = require("mongoose");

// Shortcut for schema creation
const Schema = mongoose.Schema;

// Listing Schema - defines structure of property listings
const listingSchema = new Schema({

    // Title of the property shown to users
    title: String,

    // Description of the listing
    description: String,

    // Image URL for the property
    // Default image is used if none is provided
    image: {
        type: String,
        default: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1000"
    },

    // Price per night (used in booking calculations)
    price: Number,

    // Location (city or area)
    location: String,

    // Country of the listing
    country: String,

    // Latitude and longitude used for map display and distance calculations
    latitude: Number,
    longitude: Number,

    // Reference to the user who created the listing (host)
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User"
    },

    // Array of reviews linked to this listing
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: "Review"
        }
    ]
});

// Create Listing model
const Listing = mongoose.model("Listing", listingSchema);

// Export model for use in routes
module.exports = Listing;