// ==========================================
// SETUP & IMPORTS
// ==========================================
const express = require("express");
const router = express.Router();

// Models
const Listing = require("../models/listing");
const User = require("../models/user");
const Booking = require("../models/booking");

// Middleware (security & validation)
const { isLoggedIn, isOwner, validateListing } = require("../middleware");

// MongoDB ObjectId validation
const mongoose = require("mongoose");

// External API for geocoding & weather
const axios = require("axios");


// ==========================================
// FEATURE 1: GEOSPATIAL DISTANCE CALCULATION
// ==========================================
// Calculates distance between two coordinates (used for nearby listings & AI assistant)
function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;

    const R = 6371; // Earth radius in km

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}


// ==========================================
// FEATURE 2: SEARCH, FILTER & SORT LISTINGS
// ==========================================
router.get("/", async (req, res) => {

    const { search = "", location = "", maxPrice = "", sort = "" } = req.query;

    let filter = {};

// keyword search (title + description)
if (search && search.trim() !== "") {
    filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
    ];
}

// location search
if (location && location.trim() !== "") {
    filter.location = { $regex: location, $options: "i" };
}

// price filter
if (maxPrice && maxPrice !== "") {
    filter.price = { $lte: Number(maxPrice) };
}

    let query = Listing.find(filter).populate("reviews");

    // Sorting options
    if (sort === "priceLowHigh") query.sort({ price: 1 });
    if (sort === "priceHighLow") query.sort({ price: -1 });
    if (sort === "titleAZ") query.sort({ title: 1 });

    const listings = await query;

    res.render("listings/index", { listings, search, location, maxPrice, sort });
});


// ==========================================
// FEATURE 3: CREATE LISTING (WITH GEOCODING)
// ==========================================
router.get("/new", isLoggedIn, (req, res) => {
    res.render("listings/new");
});

router.post("/", isLoggedIn, validateListing, async (req, res) => {

    const newListing = new Listing(req.body);

    try {
        // Convert location → latitude & longitude
        const response = await axios.get("https://nominatim.openstreetmap.org/search", {
            params: {
                format: "json",
                q: `${newListing.location}, ${newListing.country}`,
                limit: 1
            },
            headers: {
                "User-Agent": "LifeBeyondFinalYearProject"
            }
        });

        if (response.data.length > 0) {
            newListing.latitude = parseFloat(response.data[0].lat);
            newListing.longitude = parseFloat(response.data[0].lon);
        }

    } catch (err) {
        console.log("Geocoding error:", err.message);
    }

    // Assign owner
    newListing.owner = req.session.userId;

    await newListing.save();

    req.flash("success", "Listing created successfully!");
    res.redirect("/listings");
});


// ==========================================
// FEATURE 4: HOST DASHBOARD (MY LISTINGS)
// ==========================================
router.get("/my/listings", isLoggedIn, async (req, res) => {
    const listings = await Listing.find({ owner: req.session.userId }).populate("reviews");
    res.render("listings/myListings", { listings });
});


// ==========================================
// FEATURE 5: AI HOLIDAY RECOMMENDER SYSTEM
// ==========================================
router.get("/assistant", (req, res) => {
    res.render("listings/assistant");
});

router.get("/assistant/results", async (req, res) => {

    const { budget, location, country, stayType, guests, radius } = req.query;

    let searchLat = null;
    let searchLng = null;
    let weatherSummary = null;

    // STEP 1: Convert location → coordinates
    try {
        const geoResponse = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
            params: { name: location, count: 1 }
        });

        if (geoResponse.data.results?.length > 0) {
            searchLat = geoResponse.data.results[0].latitude;
            searchLng = geoResponse.data.results[0].longitude;
        }
    } catch (err) {
        console.log("Geocoding error:", err.message);
    }

    // STEP 2: Get weather data
    if (searchLat && searchLng) {
        try {
            const weatherResponse = await axios.get("https://api.open-meteo.com/v1/forecast", {
                params: {
                    latitude: searchLat,
                    longitude: searchLng,
                    daily: "weathercode,temperature_2m_max,temperature_2m_min"
                }
            });

            weatherSummary = weatherResponse.data.daily;

        } catch (err) {
            console.log("Weather error:", err.message);
        }
    }

    // STEP 3: Recommendation scoring algorithm
    const allListings = await Listing.find({
        latitude: { $ne: null },
        longitude: { $ne: null }
    });

    const recommendations = allListings
        .map((listing) => {
            let score = 0;

            const distance = getDistanceInKm(
                searchLat, searchLng,
                listing.latitude, listing.longitude
            );

            if (distance > Number(radius)) return null;

            score += 50; // base score

            if (listing.price <= budget) score += 40;
            if (listing.country?.toLowerCase().includes(country?.toLowerCase())) score += 10;
            if (Number(guests) >= 3) score += 5;

            return { ...listing.toObject(), score, distance };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

    res.render("listings/assistantResults", {
        recommendations,
        preferences: req.query,
        weatherSummary
    });
});


// ==========================================
// FEATURE 6: SINGLE LISTING PAGE
// ==========================================
router.get("/:id", async (req, res) => {

    const listing = await Listing.findById(req.params.id)
        .populate("owner")
        .populate({ path: "reviews", populate: { path: "author" } });

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    // Wishlist feature
    let isSaved = false;
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        isSaved = user.wishlist.includes(listing._id);
    }

    // Average rating
    let averageRating = 0;
    if (listing.reviews.length > 0) {
        averageRating = (
            listing.reviews.reduce((sum, r) => sum + r.rating, 0) /
            listing.reviews.length
        ).toFixed(1);
    }

    // Nearby listings (geospatial feature)
    let nearbyListings = [];
    if (listing.latitude && listing.longitude) {
        const allListings = await Listing.find({ _id: { $ne: listing._id } });

        nearbyListings = allListings
            .map((l) => ({
                ...l.toObject(),
                distance: getDistanceInKm(
                    listing.latitude,
                    listing.longitude,
                    l.latitude,
                    l.longitude
                )
            }))
            .filter(l => l.distance <= 50)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 4);
    }

    // Only allow reviews if user has paid
    let canReview = false;
    if (req.session.userId) {
        const paidBooking = await Booking.findOne({
            listing: listing._id,
            user: req.session.userId,
            status: "paid"
        });
        if (paidBooking) canReview = true;
    }

    res.render("listings/show", {
        listing,
        isSaved,
        averageRating,
        nearbyListings,
        canReview
    });
});


// ==========================================
// FEATURE 7: EDIT & DELETE LISTINGS
// ==========================================
router.get("/:id/edit", isLoggedIn, isOwner, async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    res.render("listings/edit", { listing });
});

router.put("/:id", isLoggedIn, isOwner, validateListing, async (req, res) => {
    await Listing.findByIdAndUpdate(req.params.id, req.body);
    req.flash("success", "Listing updated.");
    res.redirect(`/listings/${req.params.id}`);
});

router.delete("/:id", isLoggedIn, isOwner, async (req, res) => {
    await Listing.findByIdAndDelete(req.params.id);
    req.flash("success", "Listing deleted.");
    res.redirect("/listings");
});


// ==========================================
module.exports = router;