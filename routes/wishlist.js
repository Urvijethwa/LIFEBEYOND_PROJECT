const express = require("express");
const router = express.Router();
const User = require("../models/user");
const { isLoggedIn } = require("../middleware");

// Add to wishlist
router.post("/listings/:id/wishlist", isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const user = await User.findById(req.session.userId);

    if (!user.wishlist.includes(id)) {
        user.wishlist.push(id);
        await user.save();
        req.flash("success", "Listing added to wishlist.");
    } else {
        req.flash("error", "Listing is already in your wishlist.");
    }

    res.redirect(`/listings/${id}`);
});

// Remove from wishlist
router.post("/listings/:id/remove-wishlist", isLoggedIn, async (req, res) => {
    const { id } = req.params;

    await User.findByIdAndUpdate(req.session.userId, {
        $pull: { wishlist: id }
    });

    req.flash("success", "Listing removed from wishlist.");
    res.redirect("/wishlist");
});

// Wishlist page
router.get("/wishlist", isLoggedIn, async (req, res) => {
    const user = await User.findById(req.session.userId).populate("wishlist");
    res.render("users/wishlist", { wishlist: user.wishlist });
});

module.exports = router;