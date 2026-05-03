const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const messageSchema = new Schema({
    listing: {
        type: Schema.Types.ObjectId,
        ref: "Listing",
        required: true
    },

    sender: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    receiver: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    message: {
        type: String,
        required: true
    },

    reply: {
        type: String,
        default: ""
    },

    status: {
        type: String,
        enum: ["sent", "replied"],
        default: "sent"
    }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);