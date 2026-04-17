const express = require("express");
const router = express.Router({ mergeParams: true });
const Listing = require("../models/listing");
const Review = require("../models/review");
const { isLoggedIn, isReviewAuthor, validateReview } = require("../middleware");

// Create review
router.post("/", isLoggedIn, validateReview, async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    const review = new Review(req.body);
    review.author = req.session.userId;

    await review.save();

    listing.reviews.push(review);
    await listing.save();

    req.flash("success", "Review added successfully.");
    res.redirect(`/listings/${id}`);
});

// Delete review
router.delete("/:reviewId", isLoggedIn, isReviewAuthor, async (req, res) => {
    const { id, reviewId } = req.params;

    await Listing.findByIdAndUpdate(id, {
        $pull: { reviews: reviewId }
    });

    await Review.findByIdAndDelete(reviewId);

    req.flash("success", "Review deleted successfully.");
    res.redirect(`/listings/${id}`);
});

module.exports = router;