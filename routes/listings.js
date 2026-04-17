const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");
const User = require("../models/user");
const { isLoggedIn, isOwner, validateListing } = require("../middleware");

// Home page - show all listings with search, filter, and sorting
router.get("/", async (req, res) => {
    const { search = "", location = "", maxPrice = "", sort = "" } = req.query;

    let filter = {};

    if (search) {
        filter.title = { $regex: search, $options: "i" };
    }

    if (location) {
        filter.location = { $regex: location, $options: "i" };
    }

    if (maxPrice) {
        filter.price = { $lte: Number(maxPrice) };
    }

    let sortOption = {};

    if (sort === "priceLowHigh") {
        sortOption.price = 1;
    } else if (sort === "priceHighLow") {
        sortOption.price = -1;
    } else if (sort === "titleAZ") {
        sortOption.title = 1;
    }

    const listings = await Listing.find(filter).sort(sortOption);
    res.render("listings/index", { listings, search, location, maxPrice, sort });
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

    res.render("listings/show", { listing, isSaved });
});

// Edit form
router.get("/:id/edit", isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;
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
    await Listing.findByIdAndUpdate(id, req.body);
    req.flash("success", "Listing updated successfully.");
    res.redirect(`/listings/${id}`);
});

// Delete listing
router.delete("/:id", isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted successfully.");
    res.redirect("/listings");
});

module.exports = router;