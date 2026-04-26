const express = require("express");
const router = express.Router();
const Listing = require("../models/listing");
const User = require("../models/user");
const { isLoggedIn, isOwner, validateListing } = require("../middleware");
const mongoose = require("mongoose");
const Booking = require("../models/booking");


//geocoding - longtude latitude 
const axios = require("axios");

function getDistanceInKm(lat1, lon1, lat2, lon2) {
    const toRad = (value) => (value * Math.PI) / 180;

    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

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

    try {
        const response = await axios.get(
            "https://nominatim.openstreetmap.org/search",
            {
                params: {
                    format: "json",
                    q: `${newListing.location}, ${newListing.country}`,
                    limit: 1
                },
                headers: {
                    "User-Agent": "LifeBeyondFinalYearProject/1.0 (student project)"
                }
            }
        );

        if (response.data.length > 0) {
            newListing.latitude = parseFloat(response.data[0].lat);
            newListing.longitude = parseFloat(response.data[0].lon);
        }
    } catch (err) {
        console.log("Geocoding error:", err.response?.status || err.message);
    }

    newListing.owner = req.session.userId;
    await newListing.save();

    req.flash("success", "Listing created successfully!");
    res.redirect("/listings");
});

// Show listings created by current user
router.get("/my/listings", isLoggedIn, async (req, res) => {
    const listings = await Listing.find({ owner: req.session.userId }).populate("reviews");
    res.render("listings/myListings", { listings });
});

// Holiday recommender assistant form
router.get("/assistant", (req, res) => {
    res.render("listings/assistant");
});

// Holiday recommender assistant results
router.get("/assistant/results", async (req, res) => {
    const { budget, location, country, stayType, guests, radius } = req.query;

    let searchLat = null;
    let searchLng = null;
    let weatherSummary = null;

    // Step 1: Convert preferred location into coordinates
    try {
        const geoResponse = await axios.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            {
                params: {
                    name: location,
                    count: 1,
                    language: "en",
                    format: "json"
                }
            }
        );

        if (geoResponse.data.results && geoResponse.data.results.length > 0) {
            searchLat = parseFloat(geoResponse.data.results[0].latitude);
            searchLng = parseFloat(geoResponse.data.results[0].longitude);
        }
    } catch (err) {
        console.log("Assistant geocoding error:", err.message);
    }

    // Step 2: Get weather for that location
    if (searchLat != null && searchLng != null) {
        try {
            const weatherResponse = await axios.get(
                "https://api.open-meteo.com/v1/forecast",
                {
                    params: {
                        latitude: searchLat,
                        longitude: searchLng,
                        daily: "weathercode,temperature_2m_max,temperature_2m_min",
                        timezone: "auto",
                        forecast_days: 1
                    }
                }
            );

            if (weatherResponse.data.daily) {
                const code = weatherResponse.data.daily.weathercode[0];
                const maxTemp = weatherResponse.data.daily.temperature_2m_max[0];
                const minTemp = weatherResponse.data.daily.temperature_2m_min[0];

                let weatherText = "Unknown weather";

                if ([0, 1].includes(code)) {
                    weatherText = "Clear or mostly clear";
                } else if ([2, 3].includes(code)) {
                    weatherText = "Cloudy";
                } else if ([45, 48].includes(code)) {
                    weatherText = "Foggy";
                } else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
                    weatherText = "Rainy";
                } else if ([71, 73, 75, 85, 86].includes(code)) {
                    weatherText = "Snowy";
                } else if ([95, 96, 99].includes(code)) {
                    weatherText = "Stormy";
                }

                weatherSummary = {
                    code,
                    weatherText,
                    maxTemp,
                    minTemp
                };
            }
        } catch (err) {
            console.log("Weather API error:", err.message);
        }
    }

    // Step 3: Score listings
    const allListings = await Listing.find({});

    const recommendations = allListings
        .map((listing) => {
            let score = 0;
            let distance = null;
            let explanation = [];

            // Budget scoring
            if (listing.price <= Number(budget)) {
                score += 40;
                explanation.push("within your budget");
            } else {
                const difference = listing.price - Number(budget);
                if (difference <= 200) {
                    score += 20;
                    explanation.push("slightly above your budget");
                }
            }

            // Country match
            if (
                listing.country &&
                listing.country.toLowerCase().includes(country.toLowerCase())
            ) {
                score += 10;
                explanation.push("matches your country preference");
            }

            // Distance scoring
            if (
                searchLat != null &&
                searchLng != null &&
                listing.latitude != null &&
                listing.longitude != null
            ) {
                distance = getDistanceInKm(
                    searchLat,
                    searchLng,
                    listing.latitude,
                    listing.longitude
                );

                if (distance <= Number(radius)) {
                    score += 35;
                    explanation.push("within your preferred distance");
                } else if (distance <= Number(radius) + 20) {
                    score += 15;
                    explanation.push("close to your preferred area");
                }
            }

            // Stay type scoring
            if (stayType === "short" && listing.price <= Number(budget)) {
                score += 10;
                explanation.push("good for a short stay budget");
            }

            if (stayType === "long" && listing.price <= Number(budget) * 0.9) {
                score += 10;
                explanation.push("more suitable for longer stays");
            }

            // Guests scoring
            if (Number(guests) <= 2) {
                score += 5;
            } else if (Number(guests) <= 4) {
                score += 8;
            } else {
                score += 10;
            }

            // Weather-aware bonus
            if (weatherSummary) {
                if (
                    ["Clear or mostly clear", "Cloudy"].includes(weatherSummary.weatherText) &&
                    distance != null &&
                    distance <= Number(radius)
                ) {
                    score += 5;
                    explanation.push("weather is suitable for your chosen area");
                }

                if (
                    ["Rainy", "Stormy", "Foggy", "Snowy"].includes(weatherSummary.weatherText) &&
                    listing.price <= Number(budget)
                ) {
                    score += 5;
                    explanation.push("good value despite current weather conditions");
                }
            }

            return {
                ...listing.toObject(),
                score,
                distance: distance != null ? distance.toFixed(1) : null,
                explanation
            };
        })
        .filter((listing) => listing.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);

    res.render("listings/assistantResults", {
        recommendations,
        preferences: { budget, location, country, stayType, guests, radius },
        weatherSummary
    });
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

    let reviewSummary = "No review summary available yet.";

    if (listing.reviews.length > 0) {
        const positiveReviews = listing.reviews.filter(r => r.rating >= 4).length;
        const negativeReviews = listing.reviews.filter(r => r.rating <= 2).length;

        if (positiveReviews > negativeReviews) {
            reviewSummary = "Guests generally had a positive experience.";
        } else if (negativeReviews > positiveReviews) {
            reviewSummary = "Some guests reported issues with this property.";
        } else {
            reviewSummary = "Mixed reviews from guests.";
        }
    }

    let nearbyListings = [];

    if (listing.latitude != null && listing.longitude != null) {
        const allListings = await Listing.find({
            _id: { $ne: listing._id },
            latitude: { $ne: null },
            longitude: { $ne: null }
        });

        nearbyListings = allListings
            .map((otherListing) => {
                const distance = getDistanceInKm(
                    listing.latitude,
                    listing.longitude,
                    otherListing.latitude,
                    otherListing.longitude
                );

                return {
                    ...otherListing.toObject(),
                    distance: distance.toFixed(1)
                };
            })
            .filter((item) => item.distance <= 50)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 4);
    }

    let canReview = false;

    if (req.session.userId) {
        const paidBooking = await Booking.findOne({
            listing: listing._id,
            user: req.session.userId,
            status: "paid"
        });

        if (paidBooking) {
            canReview = true;
        }
    }

    res.render("listings/show", {
        listing,
        isSaved,
        averageRating,
        nearbyListings,
        reviewSummary,
        canReview
    });
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
// Update listing
router.put("/:id", isLoggedIn, isOwner, validateListing, async (req, res) => {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash("error", "Invalid listing ID.");
        return res.redirect("/listings");
    }

    const updatedData = { ...req.body };

    try {
        const response = await axios.get(
            "https://nominatim.openstreetmap.org/search",
            {
                params: {
                    format: "json",
                    q: `${updatedData.location}, ${updatedData.country}`,
                    limit: 1
                },
                headers: {
                    "User-Agent": "LifeBeyondFinalYearProject/1.0 (student project)"
                }
            }
        );

        if (response.data.length > 0) {
            updatedData.latitude = parseFloat(response.data[0].lat);
            updatedData.longitude = parseFloat(response.data[0].lon);
        }
    } catch (err) {
        console.log("Update geocoding error:", err.response?.status || err.message);
    }

    await Listing.findByIdAndUpdate(id, updatedData, { runValidators: true });

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