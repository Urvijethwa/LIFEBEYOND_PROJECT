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
    const priceNumber = Number(maxPrice);

    if (priceNumber < 0) {
        req.flash("error", "Maximum price cannot be negative.");
        return res.redirect("/listings");
    }

    filter.price = { $lte: priceNumber };
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

    const newListing = new Listing({
    ...req.body,
    price: Number(req.body.price),
    maxGuests: Number(req.body.maxGuests)
});

    if (newListing.price < 0) {
    req.flash("error", "Price cannot be negative.");
    return res.redirect("/listings/new");
    }

    if (newListing.maxGuests && newListing.maxGuests < 1) {
        req.flash("error", "Guest capacity must be at least 1.");
        return res.redirect("/listings/new");
    }

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

    const userBudget = Number(budget);
    const userGuests = Number(guests);
    const userRadius = Number(radius);

    let searchLat = null;
    let searchLng = null;
    let weatherSummary = null;

    // Convert user location into coordinates
    try {
        const geoResponse = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
            params: {
                name: location,
                count: 1
            }
        });

        if (geoResponse.data.results && geoResponse.data.results.length > 0) {
            searchLat = geoResponse.data.results[0].latitude;
            searchLng = geoResponse.data.results[0].longitude;
        }
    } catch (err) {
        console.log("Assistant geocoding error:", err.message);
    }

    // Get weather for preferred location
    if (searchLat && searchLng) {
        try {
            const weatherResponse = await axios.get("https://api.open-meteo.com/v1/forecast", {
                params: {
                    latitude: searchLat,
                    longitude: searchLng,
                    daily: "weathercode,temperature_2m_max,temperature_2m_min",
                    forecast_days: 1
                }
            });

            const daily = weatherResponse.data.daily;

            weatherSummary = {
                maxTemp: daily.temperature_2m_max[0],
                minTemp: daily.temperature_2m_min[0],
                weatherCode: daily.weathercode[0],
                weatherText: "Weather data considered in recommendations"
            };

        } catch (err) {
            console.log("Assistant weather error:", err.message);
        }
    }

    // Get all listings with coordinates
    const allListings = await Listing.find({
        latitude: { $ne: null },
        longitude: { $ne: null }
    }).populate("reviews");

    const recommendations = allListings.map((listing) => {
        let score = 0;
        let explanation = [];
        let warnings = [];

        let distance = null;

        if (searchLat && searchLng && listing.latitude && listing.longitude) {
            distance = getDistanceInKm(
                searchLat,
                searchLng,
                listing.latitude,
                listing.longitude
            );
            distance = Number(distance.toFixed(1));
        }

        // Budget scoring
        if (listing.price <= userBudget) {
            score += 30;
            explanation.push("within your budget");
        } else if (listing.price <= userBudget + 200) {
            score += 12;
            warnings.push("slightly above your budget");
        } else {
            warnings.push("above your selected budget");
        }

        // Distance scoring
        if (distance !== null) {
            if (distance <= userRadius) {
                score += 30;
                explanation.push(`only ${distance} km from your preferred location`);
            } else if (distance <= userRadius + 10) {
                score += 12;
                warnings.push(`slightly outside your preferred distance (${distance} km away)`);
            } else {
                warnings.push(`far from your preferred location (${distance} km away)`);
            }
        }

        // Country scoring
        if (
            listing.country &&
            country &&
            listing.country.toLowerCase().includes(country.toLowerCase())
        ) {
            score += 15;
            explanation.push("matches your selected country");
        }

        // Guest capacity scoring
        if (listing.maxGuests && listing.maxGuests >= userGuests) {
            score += 15;
            explanation.push(`suitable for ${userGuests} guest${userGuests > 1 ? "s" : ""}`);
        } else if (listing.maxGuests && listing.maxGuests < userGuests) {
            score -= 20;
            warnings.push(`only allows up to ${listing.maxGuests} guests`);
        }

        // Stay type scoring
        if (stayType === "short") {
            score += 5;
            explanation.push("suitable for a short stay");
        }

        if (stayType === "long") {
            score += 5;
            explanation.push("suitable for a longer stay");
        }

        // Rating scoring
        if (listing.reviews && listing.reviews.length > 0) {
            const avgRating =
                listing.reviews.reduce((sum, r) => sum + r.rating, 0) /
                listing.reviews.length;

            if (avgRating >= 4) {
                score += 5;
                explanation.push("has strong guest ratings");
            }
        }

        // Weather bonus
        if (weatherSummary) {
            score += 5;
            explanation.push("weather data was considered");
        }

        const matchPercent = Math.max(0, Math.min(score, 100));

        let matchLabel = "Low Match";
        if (matchPercent >= 85) matchLabel = "Best Match";
        else if (matchPercent >= 70) matchLabel = "Excellent Match";
        else if (matchPercent >= 50) matchLabel = "Good Match";
        else if (matchPercent >= 30) matchLabel = "Possible Match";

        return {
            ...listing.toObject(),
            distance,
            matchPercent,
            matchLabel,
            explanation,
            warnings
        };
    })
    .filter(listing => {
    return (
        listing.matchPercent >= 50 &&
        listing.distance !== null &&
        listing.distance <= userRadius + 10 &&
        (!listing.maxGuests || listing.maxGuests >= userGuests)
    );
})
    .sort((a, b) => b.matchPercent - a.matchPercent)
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
        const allListings = await Listing.find({
    _id: { $ne: listing._id },
    latitude: { $ne: null },
    longitude: { $ne: null }
});

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

    if (!listing) {
        req.flash("error", "Listing not found.");
        return res.redirect("/listings");
    }

    res.render("listings/edit", { listing });
});

router.put("/:id", isLoggedIn, isOwner, validateListing, async (req, res) => {
    const updatedListing = req.body;

    updatedListing.price = Number(updatedListing.price);
    updatedListing.maxGuests = Number(updatedListing.maxGuests);

    if (updatedListing.price <= 0 || isNaN(updatedListing.price)) {
        req.flash("error", "Price must be greater than 0.");
        return res.redirect(`/listings/${req.params.id}/edit`);
    }

    if (updatedListing.maxGuests < 1 || isNaN(updatedListing.maxGuests)) {
        req.flash("error", "Maximum guests must be at least 1.");
        return res.redirect(`/listings/${req.params.id}/edit`);
    }

    await Listing.findByIdAndUpdate(req.params.id, updatedListing, {
        runValidators: true
    });

    req.flash("success", "Listing updated successfully.");
    res.redirect(`/listings/${req.params.id}`);
});

router.delete("/:id", isLoggedIn, isOwner, async (req, res) => {
    await Listing.findByIdAndDelete(req.params.id);
    req.flash("success", "Listing deleted.");
    res.redirect("/listings");
});


// ==========================================
module.exports = router;