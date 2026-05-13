const express = require("express");
const router = express.Router();

const Listing = require("../models/listing");
const Booking = require("../models/booking");

const { isLoggedIn, isGuest } = require("../middleware");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Show booking form
router.get("/listings/:id/book", isLoggedIn, isGuest, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("bookings/new", { listing });
});

// Save booking with availability check
router.post("/listings/:id/book", isLoggedIn, isGuest, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const { checkIn, checkOut, guests, message } = req.body;

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const nights = (endDate - startDate) / (1000 * 60 * 60 * 24);

    if (startDate < today) {
        req.flash("error", "Check-in date cannot be in the past.");
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    if (nights <= 0) {
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    const totalGuests = Number(guests);

    if (!totalGuests || totalGuests < 1) {
        req.flash("error", "Please select at least 1 guest.");
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    if (totalGuests > listing.maxGuests) {
        req.flash("error", `This property only allows up to ${listing.maxGuests} guests.`);
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    const existingBooking = await Booking.findOne({
        listing: listing._id,
        status: { $in: ["pending", "approved", "paid"] },
        checkIn: { $lt: endDate },
        checkOut: { $gt: startDate }
    });

    if (existingBooking) {
        req.flash("error", "This property is already booked for the selected dates. Please choose different dates.");
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    const totalPrice = nights * listing.price;

    const booking = new Booking({
        listing: listing._id,
        user: req.session.userId,
        owner: listing.owner._id,
        checkIn: startDate,
        checkOut: endDate,
        guests: totalGuests,
        totalPrice,
        message,
        status: "pending"
    });

    await booking.save();

    req.flash("success", "Booking created. Continue to payment.");
    res.redirect(`/bookings/${booking._id}/pay`);
});

// Show enquiry form
router.get("/listings/:id/enquiry", isLoggedIn, isGuest, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("bookings/enquiry", { listing });
});

// Save enquiry
router.post("/listings/:id/enquiry", isLoggedIn, isGuest, async (req, res) => {

    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const { viewingDate, viewingTime, message } = req.body;

    // Current date
    const selectedDate = new Date(viewingDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Prevent past dates
    if (selectedDate < today) {
        req.flash("error", "Viewing date cannot be in the past.");
        return res.redirect(`/listings/${req.params.id}/enquiry`);
    }

    // Message validation
    if (!message || message.trim().length < 5) {
        req.flash("error", "Please enter a proper message for the host.");
        return res.redirect(`/listings/${req.params.id}/enquiry`);
    }

    const enquiry = new Booking({
        listing: listing._id,
        user: req.session.userId,
        owner: listing.owner._id,
        viewingDate,
        viewingTime,
        message,
        status: "enquiry"
    });

    await enquiry.save();

    req.flash("success", "Viewing request sent successfully.");
    res.redirect(`/listings/${listing._id}`);
});

// Guest bookings
router.get("/my-bookings", isLoggedIn, isGuest, async (req, res) => {
    const bookings = await Booking.find({ user: req.session.userId })
        .populate("listing")
        .populate("owner")
        .sort({ createdAt: -1 });

    res.render("bookings/myBookings", { bookings });
});

// Owner bookings
router.get("/owner/bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ owner: req.session.userId })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

    res.render("bookings/ownerBookings", { bookings });
});

// Cancel booking
router.post("/bookings/:id/cancel", isLoggedIn, isGuest, async (req, res) => {
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

// Approve booking
router.post("/bookings/:id/approve", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking || !booking.owner.equals(req.session.userId)) {
        req.flash("error", "Permission denied.");
        return res.redirect("/owner/bookings");
    }

    booking.status = "approved";
    await booking.save();

    req.flash("success", "Booking approved.");
    res.redirect("/owner/bookings");
});

// Reject booking
router.post("/bookings/:id/reject", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking || !booking.owner.equals(req.session.userId)) {
        req.flash("error", "Permission denied.");
        return res.redirect("/owner/bookings");
    }

    booking.status = "rejected";
    await booking.save();

    req.flash("success", "Booking rejected.");
    res.redirect("/owner/bookings");
});

// Stripe payment
router.get("/bookings/:id/pay", isLoggedIn, isGuest, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate("listing");

    if (!booking || !booking.user.equals(req.session.userId)) {
        req.flash("error", "Permission denied.");
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

// Payment success
router.get("/bookings/:id/success", isLoggedIn, isGuest, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking || !booking.user.equals(req.session.userId)) {
        req.flash("error", "Permission denied.");
        return res.redirect("/my-bookings");
    }

    booking.status = "paid";
    await booking.save();

    req.flash("success", "Payment successful. Booking confirmed.");
    res.redirect("/my-bookings");
});

module.exports = router;