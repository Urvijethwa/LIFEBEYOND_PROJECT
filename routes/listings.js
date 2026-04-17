const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");
const User = require("../models/user");
const { isLoggedIn, isOwner, validateListing } = require("../middleware");
const mongoose = require("mongoose");

// Home page - show all listings with search, filter, and sorting
router.get("/", async (req, res) => {
    const { search = "", location = "", maxPrice = "", sort = "" } = req.query;

    let filter = {};

    // OR search for title OR location
    if (search || location) {
        filter.$or = [];

        if (search) {
            filter.$or.push({
                title: { $regex: search, $options: "i" }
            });
        }

        if (location) {
            filter.$or.push({
                location: { $regex: location, $options: "i" }
            });
        }
    }

    // Price filter
    if (maxPrice) {
        filter.price = { $lte: Number(maxPrice) };
    }

    let query = Listing.find(filter).populate("reviews");

    // Sorting
    if (sort === "priceLowHigh") {
        query = query.sort({ price: 1 });
    } else if (sort === "priceHighLow") {
        query = query.sort({ price: -1 });
    } else if (sort === "titleAZ") {
        query = query.sort({ title: 1 });
    }

    const listings = await query;

    res.render("listings/index", {
        listings,
        search,
        location,
        maxPrice,
        sort
    });
});

// New listing form
router.get("/new", isLoggedIn, (req, res) => {
    res.render("listings/new");
});

// Create listing
router.post("/", isLoggedIn, validateListing, async (req, res) => {
    const newListing = new Listing(req.body);
    newListing.owner = req.session.userId;
    await newListing.save();
    req.flash("success", "New listing created successfully.");
    res.redirect("/listings");
});

// Show listings created by current user
router.get("/my/listings", isLoggedIn, async (req, res) => {
    const listings = await Listing.find({ owner: req.session.userId }).populate("reviews");
    res.render("listings/myListings", { listings });
});

// Show single listing
router.get("/:id", async (req, res) => {
    const { id } = req.params;

    const listing = await Listing.findById(id)
        .populate("owner")
        .populate({
            path: "reviews",
            populate: {
                path: "author"
            }
        });

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    let isSaved = false;

    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        isSaved = user.wishlist.includes(listing._id);
    }

    let averageRating = 0;

    if (listing.reviews.length > 0) {
        const total = listing.reviews.reduce((sum, review) => sum + review.rating, 0);
        averageRating = (total / listing.reviews.length).toFixed(1);
    }

    res.render("listings/show", { listing, isSaved, averageRating });
});

// Edit form
router.get("/:id/edit", isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("listings/edit", { listing });
});

// Update listing
router.put("/:id", isLoggedIn, isOwner, validateListing, async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    await Listing.findByIdAndUpdate(id, req.body);
    req.flash("success", "Listing updated successfully.");
    res.redirect(`/listings/${id}`);
});

// Delete listing
router.delete("/:id", isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted successfully.");
    res.redirect("/listings");
});

module.exports = router;