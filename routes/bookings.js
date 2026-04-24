const express = require("express");
const router = express.Router({ mergeParams: true });
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const { isLoggedIn } = require("../middleware");

// Show booking form
router.get("/listings/:id/book", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("bookings/new", { listing });
});

// Save booking
router.post("/listings/:id/book", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const { checkIn, checkOut, guests, message } = req.body;

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    const timeDifference = endDate - startDate;
    const nights = timeDifference / (1000 * 60 * 60 * 24);

    if (nights <= 0) {
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    const totalPrice = nights * listing.price;

    const booking = new Booking({
        listing: listing._id,
        user: req.session.userId,
        owner: listing.owner._id,
        checkIn: startDate,
        checkOut: endDate,
        guests,
        totalPrice,
        message
    });

    await booking.save();

    req.flash("success", "Booking request sent successfully.");
    res.redirect("/my-bookings");
});

// My bookings page
router.get("/my-bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ user: req.session.userId })
        .populate("listing")
        .populate("owner")
        .sort({ createdAt: -1 });

    res.render("bookings/myBookings", { bookings });
});

// Cancel booking
router.post("/bookings/:id/cancel", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/my-bookings");
    }

    if (!booking.user.equals(req.session.userId)) {
        req.flash("error", "You do not have permission to cancel this booking.");
        return res.redirect("/my-bookings");
    }

    booking.status = "cancelled";
    await booking.save();

    req.flash("success", "Booking cancelled successfully.");
    res.redirect("/my-bookings");
});

// Owner bookings page
router.get("/owner/bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ owner: req.session.userId })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

    res.render("bookings/ownerBookings", { bookings });
});

module.exports = router;