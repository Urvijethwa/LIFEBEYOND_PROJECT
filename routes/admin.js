//sends all the user + booking to the dashboard
const express = require("express");
const router = express.Router();

const User = require("../models/user");
const Booking = require("../models/booking");

const { isLoggedIn, isAdmin } = require("../middleware");

router.get("/admin/dashboard", isLoggedIn, isAdmin, async (req, res) => {
    const users = await User.find({});
    const bookings = await Booking.find({})
        .populate("user")
        .populate("listing");

    res.render("admin/dashboard", { users, bookings });
});

module.exports = router;