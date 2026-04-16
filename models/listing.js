const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const listingSchema = new Schema({
    title: String,
    description: String,
    image: {
        type: String,
        default: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1000"
    },
    price: Number,
    location: String,
    country: String,
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User"
    }
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;