const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");
const Booking = require("../models/booking");
const { isLoggedIn } = require("../middleware");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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

    const nights = (endDate - startDate) / (1000 * 60 * 60 * 24);

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
        message,
        status: "pending"
    });

    await booking.save();

    req.flash("success", "Booking request sent successfully.");
    res.redirect("/my-bookings");
});

// Show enquiry form
router.get("/listings/:id/enquiry", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("bookings/enquiry", { listing });
});

// Save enquiry
router.post("/listings/:id/enquiry", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const enquiry = new Booking({
        listing: listing._id,
        user: req.session.userId,
        owner: listing.owner._id,
        message: req.body.message,
        status: "enquiry"
    });

    await enquiry.save();

    req.flash("success", "Enquiry sent to owner.");
    res.redirect(`/listings/${listing._id}`);
});

// My bookings page
router.get("/my-bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ user: req.session.userId })
        .populate("listing")
        .populate("owner")
        .sort({ createdAt: -1 });

    res.render("bookings/myBookings", { bookings });
});

// Owner bookings page
router.get("/owner/bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ owner: req.session.userId })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

    res.render("bookings/ownerBookings", { bookings });
});

// Cancel booking
router.post("/bookings/:id/cancel", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/my-bookings");
    }

    if (!booking.user.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/my-bookings");
    }

    booking.status = "cancelled";
    await booking.save();

    req.flash("success", "Booking cancelled successfully.");
    res.redirect("/my-bookings");
});

// Approve booking/enquiry
router.post("/bookings/:id/approve", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/owner/bookings");
    }

    if (!booking.owner.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/owner/bookings");
    }

    booking.status = "approved";
    await booking.save();

    req.flash("success", "Booking approved.");
    res.redirect("/owner/bookings");
});

// Reject booking/enquiry
router.post("/bookings/:id/reject", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/owner/bookings");
    }

    if (!booking.owner.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/owner/bookings");
    }

    booking.status = "rejected";
    await booking.save();

    req.flash("success", "Booking rejected.");
    res.redirect("/owner/bookings");
});

// Show payment page
router.get("/bookings/:id/payment", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id)
        .populate("listing")
        .populate("owner");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/my-bookings");
    }

    if (!booking.user.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/my-bookings");
    }

    if (booking.status !== "approved") {
        req.flash("error", "Booking must be approved before payment.");
        return res.redirect("/my-bookings");
    }

    res.render("bookings/payment", { booking });
});

// Pay booking
router.post("/bookings/:id/pay", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate("listing");

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/my-bookings");
    }

    if (!booking.user.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/my-bookings");
    }

    const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
            {
                price_data: {
                    currency: "gbp",
                    product_data: {
                        name: booking.listing.title
                    },
                    unit_amount: booking.totalPrice * 100
                },
                quantity: 1
            }
        ],
        success_url: `http://localhost:8080/bookings/${booking._id}/success`,
        cancel_url: `http://localhost:8080/my-bookings`
    });

    res.redirect(session.url);
});

//stripe
router.get("/bookings/:id/success", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/my-bookings");
    }

    if (!booking.user.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/my-bookings");
    }

    booking.status = "paid";
    await booking.save();

    req.flash("success", "Payment successful. Booking confirmed.");
    res.redirect("/my-bookings");
});

module.exports = router;