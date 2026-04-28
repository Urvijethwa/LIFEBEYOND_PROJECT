const express = require("express");
const router = express.Router();

// Models
const Listing = require("../models/listing");
const Booking = require("../models/booking");

// Middleware (auth check)
const { isLoggedIn } = require("../middleware");

// Stripe for payments
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

////////////////////////////////////////////////////////////
//FEATURE 1: BOOKING CREATION (Guest books a stay)
////////////////////////////////////////////////////////////

// Show booking form
router.get("/listings/:id/book", isLoggedIn, async (req, res) => {
    // Find listing and owner
    const listing = await Listing.findById(req.params.id).populate("owner");

    // If listing doesn't exist
    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    // Render booking form page
    res.render("bookings/new", { listing });
});

// Save booking
router.post("/listings/:id/book", isLoggedIn, async (req, res) => {
    const listing = await Listing.findById(req.params.id).populate("owner");

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    // Extract form data
    const { checkIn, checkOut, guests, message } = req.body;

    // Convert dates
    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    // Calculate number of nights
    const nights = (endDate - startDate) / (1000 * 60 * 60 * 24);

    // Validation
    if (nights <= 0) {
        req.flash("error", "Check-out date must be after check-in date.");
        return res.redirect(`/listings/${req.params.id}/book`);
    }

    // Calculate total price
    const totalPrice = nights * listing.price;

    // Create booking
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

    req.flash("success", "Booking created. Continue to payment.");
    res.redirect(`/bookings/${booking._id}/pay`);
});

////////////////////////////////////////////////////////////
//FEATURE 2: ENQUIRY SYSTEM (Guest asks question)
////////////////////////////////////////////////////////////

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

    // Create enquiry (stored as booking with "enquiry" status)
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

////////////////////////////////////////////////////////////
//FEATURE 3: VIEW BOOKINGS (Guest + Owner dashboards)
////////////////////////////////////////////////////////////

// Guest: view their bookings
router.get("/my-bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ user: req.session.userId })
        .populate("listing")
        .populate("owner")
        .sort({ createdAt: -1 });

    res.render("bookings/myBookings", { bookings });
});

// Owner: view bookings for their listings
router.get("/owner/bookings", isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ owner: req.session.userId })
        .populate("listing")
        .populate("user")
        .sort({ createdAt: -1 });

    res.render("bookings/ownerBookings", { bookings });
});

////////////////////////////////////////////////////////////
//FEATURE 4: BOOKING MANAGEMENT (Cancel / Approve / Reject)
////////////////////////////////////////////////////////////

// Cancel booking (guest)
router.post("/bookings/:id/cancel", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        req.flash("error", "Booking not found.");
        return res.redirect("/my-bookings");
    }

    // Check ownership
    if (!booking.user.equals(req.session.userId)) {
        req.flash("error", "You do not have permission.");
        return res.redirect("/my-bookings");
    }

    booking.status = "cancelled";
    await booking.save();

    req.flash("success", "Booking cancelled successfully.");
    res.redirect("/my-bookings");
});

// Approve booking (host)
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

// Reject booking (host)
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

////////////////////////////////////////////////////////////
//FEATURE 5: STRIPE PAYMENT SYSTEM
////////////////////////////////////////////////////////////

// Redirect to Stripe checkout
router.get("/bookings/:id/pay", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate("listing");

    if (!booking || !booking.user.equals(req.session.userId)) {
        req.flash("error", "Permission denied.");
        return res.redirect("/my-bookings");
    }

    // Create Stripe checkout session
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
                    unit_amount: booking.totalPrice * 100 // convert £ → pence
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
router.get("/bookings/:id/success", isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking || !booking.user.equals(req.session.userId)) {
        req.flash("error", "Permission denied.");
        return res.redirect("/my-bookings");
    }

    // Mark booking as paid
    booking.status = "paid";
    await booking.save();

    req.flash("success", "Payment successful. Booking confirmed.");
    res.redirect("/my-bookings");
});

module.exports = router;