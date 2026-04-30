// Import mongoose to define schema and interact with MongoDB
const mongoose = require("mongoose");

// Create shortcut for mongoose schema
const Schema = mongoose.Schema;

// Define Booking Schema (structure of booking documents in DB)
const bookingSchema = new Schema({

    // Reference to the listing being booked
    // Links booking to a specific property
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing", // connects to Listing model
        required: true
    },

    // Reference to the user who made the booking (guest)
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    // Reference to the owner of the listing (host)
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    // Booking start date
    checkIn: {
        type: Date
    },

    // Booking end date
    checkOut: {
        type: Date
    },

    // Number of guests for the booking
    guests: {
        type: Number,
        min: 1 // must have at least 1 guest
    },

    // Total price calculated based on nights * price
    totalPrice: {
        type: Number,
        default: 0
    },

    // Optional message sent by user to owner (used in enquiry feature)
    message: {
        type: String
    },

    viewingDate: {
    type: Date
    },

    viewingTime: {
        type: String
    },

    ownerReply: {
        type: String
    },

    // Booking status to track lifecycle of booking
    status: {
        type: String,

        // Only allow these values (important validation)
        enum: [
            "enquiry",   // user just sent message
            "pending",   // booking requested
            "approved",  // owner approved
            "rejected",  // owner rejected
            "cancelled", // user cancelled
            "paid"       // payment completed
        ],

        default: "pending"
    },

    // Automatically store booking creation date
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Export Booking model so it can be used in routes
module.exports = mongoose.model("Booking", bookingSchema);