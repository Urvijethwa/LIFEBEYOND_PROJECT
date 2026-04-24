const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    checkIn: {
        type: Date
    },
    checkOut: {
        type: Date
    },
    guests: {
        type: Number,
        min: 1
    },
    totalPrice: {
        type: Number,
        default: 0
    },
    message: {
        type: String
    },
    status: {
        type: String,
        enum: ["enquiry", "pending", "approved", "rejected", "cancelled", "paid"],
        default: "pending"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Booking", bookingSchema);