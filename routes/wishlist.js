// ==========================================
// SETUP & IMPORTS
// ==========================================
const express = require("express");
const router = express.Router();

// User model (stores wishlist array)
const User = require("../models/user");

// Middleware to ensure user is logged in
const { isLoggedIn } = require("../middleware");


// ==========================================
// FEATURE 1: ADD LISTING TO WISHLIST
// ==========================================
router.post("/listings/:id/wishlist", isLoggedIn, async (req, res) => {

    // Get listing ID from URL
    const { id } = req.params;

    // Find current logged-in user
    const user = await User.findById(req.session.userId);

    // ----------------------------------
    // PREVENT DUPLICATES
    // ----------------------------------
    // Only add if listing is not already saved
    if (!user.wishlist.includes(id)) {

        // Add listing ID to wishlist array
        user.wishlist.push(id);

        // Save updated user
        await user.save();

        req.flash("success", "Listing added to wishlist.");

    } else {
        req.flash("error", "Listing is already in your wishlist.");
    }

    // Redirect back to listing page
    res.redirect(`/listings/${id}`);
});


// ==========================================
// FEATURE 2: REMOVE LISTING FROM WISHLIST
// ==========================================
router.post("/listings/:id/remove-wishlist", isLoggedIn, async (req, res) => {

    const { id } = req.params;

    // ----------------------------------
    // REMOVE ITEM USING $pull
    // ----------------------------------
    // $pull removes the listing ID from the array
    await User.findByIdAndUpdate(req.session.userId, {
        $pull: { wishlist: id }
    });

    req.flash("success", "Listing removed from wishlist.");

    // Redirect to wishlist page
    res.redirect("/wishlist");
});


// ==========================================
// FEATURE 3: VIEW WISHLIST PAGE
// ==========================================
router.get("/wishlist", isLoggedIn, async (req, res) => {

    // Get user and populate wishlist
    // populate() replaces listing IDs with full listing data
    const user = await User.findById(req.session.userId)
        .populate("wishlist");

    // Render wishlist page with listing data
    res.render("users/wishlist", {
        wishlist: user.wishlist
    });
});


// ==========================================
module.exports = router;