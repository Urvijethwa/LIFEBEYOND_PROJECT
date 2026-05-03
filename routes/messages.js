const express = require("express");
const router = express.Router();

const Message = require("../models/message");
const Listing = require("../models/listing");
const User = require("../models/user");
const { isLoggedIn } = require("../middleware");

// Show message host form
router.get("/messages/new/:listingId", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.listingId).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("messages/new", { listing });
});

// Send message to host
router.post("/messages/new/:listingId", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.listingId).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const newMessage = new Message({
        listing: listing._id,
        sender: req.session.userId,
        receiver: listing.owner._id,
        message: req.body.message
    });

    await newMessage.save();

    req.flash("success", "Message sent to host.");
    res.redirect(`/listings/${listing._id}`);
});

// View inbox
router.get("/messages", isLoggedIn, async (req, res) => {
    const messages = await Message.find({
        $or: [
            { sender: req.session.userId },
            { receiver: req.session.userId }
        ]
    })
        .populate("listing")
        .populate("sender")
        .populate("receiver")
        .sort({ createdAt: -1 });

    const user = await User.findById(req.session.userId);

    res.render("messages/inbox", { 
        messages,
        currentUser: user
    });
});

// Reply to message
router.post("/messages/:id/reply", isLoggedIn, async (req, res) => {
    const message = await Message.findById(req.params.id);

    if (!message) {
        req.flash("error", "Message not found.");
        return res.redirect("/messages");
    }

    if (!message.receiver.equals(req.session.userId)) {
        req.flash("error", "You do not have permission to reply.");
        return res.redirect("/messages");
    }

    message.reply = req.body.reply;
    message.status = "replied";
    await message.save();

    req.flash("success", "Reply sent.");
    res.redirect("/messages");
});

module.exports = router;