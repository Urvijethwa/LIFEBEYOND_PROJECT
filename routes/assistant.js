const express = require("express");
const router = express.Router();

const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");

const Listing = require("../models/listing");
const { isLoggedIn } = require("../middleware");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

function cleanGeminiJson(text) {
    return text
        .trim()
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
}

function fallbackPreferences(message) {
    const lower = message.toLowerCase();

    let location = "";

    const nearMatch = lower.match(/near\s+([a-z\s]+)/i);
    if (nearMatch) {
        location = nearMatch[1].trim();
    }

    return {
        location,
        country: "",
        budget: null,
        guests: null,
        stayType: "",
        preferences: [],
        weatherPreference: "",
        wantsExternalPlaces:
            lower.includes("external") ||
            lower.includes("hotel") ||
            lower.includes("nearby") ||
            lower.includes("place")
    };
}

router.post("/assistant/chat", isLoggedIn, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || message.trim() === "") {
            return res.status(400).json({
                success: false,
                reply: "Please type what kind of stay you are looking for."
            });
        }

        let preferences;

        try {
            const aiResponse = await ai.models.generateContent({
                model: "gemini-1.5-flash",
                contents: `
Return ONLY valid JSON. No markdown.

User message: "${message}"

Format:
{
  "location": "",
  "country": "",
  "budget": null,
  "guests": null,
  "stayType": "",
  "preferences": [],
  "weatherPreference": "",
  "wantsExternalPlaces": false
}
`
            });

            preferences = JSON.parse(cleanGeminiJson(aiResponse.text));
        } catch (err) {
            console.log("Gemini JSON extraction failed:", err.message);
            preferences = fallbackPreferences(message);
        }

        // Extra fallback location detection
if (!preferences.location) {
    const lower = message.toLowerCase();

    const locations = [
        "leicester",
        "london",
        "manchester",
        "birmingham",
        "diu",
        "india",
        "uk",
        "united kingdom"
    ];

    const foundLocation = locations.find(loc => lower.includes(loc));

    if (foundLocation) {
        preferences.location = foundLocation;
    }
}

        let filter = {};

        if (preferences.location) {
            filter.$or = [
                { location: { $regex: preferences.location, $options: "i" } },
                { country: { $regex: preferences.location, $options: "i" } },
                { title: { $regex: preferences.location, $options: "i" } },
                { description: { $regex: preferences.location, $options: "i" } }
            ];
        }

        if (preferences.budget) {
            filter.price = { $lte: Number(preferences.budget) };
        }

        if (preferences.guests) {
            filter.maxGuests = { $gte: Number(preferences.guests) };
        }

        const listings = await Listing.find(filter).populate("reviews").limit(5);

        let weather = null;
        let externalPlaces = [];
        let lat = null;
        let lon = null;

        if (preferences.location) {
            try {
                const geo = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
                    params: {
                        name: preferences.location,
                        count: 1
                    }
                });

                if (geo.data.results && geo.data.results.length > 0) {
                    lat = geo.data.results[0].latitude;
                    lon = geo.data.results[0].longitude;

                    const weatherResponse = await axios.get("https://api.open-meteo.com/v1/forecast", {
                        params: {
                            latitude: lat,
                            longitude: lon,
                            current_weather: true
                        }
                    });

                    weather = weatherResponse.data.current_weather;
                }
            } catch (err) {
                console.log("Weather/geocoding error:", err.message);
            }
        }

        if (lat && lon) {
            try {
                const overpassQuery = `
[out:json][timeout:25];
(
  nwr["tourism"~"hotel|guest_house|hostel|motel|apartment"](around:12000,${lat},${lon});
  nwr["building"~"hotel|apartments"](around:12000,${lat},${lon});
);
out center 10;
`;

                const overpassResponse = await axios.post(
                    "https://overpass-api.de/api/interpreter",
                    overpassQuery,
                    {
                        headers: {
                            "Content-Type": "text/plain",
                            "User-Agent": "LifeBeyondFinalYearProject"
                        }
                    }
                );

                externalPlaces = overpassResponse.data.elements
                    .filter(place => place.tags && place.tags.name)
                    .slice(0, 6)
                    .map(place => {
                        const placeLat = place.lat || place.center?.lat;
                        const placeLon = place.lon || place.center?.lon;

                        return {
                            name: place.tags.name,
                            type: place.tags.tourism || place.tags.building || "accommodation",
                            latitude: placeLat,
                            longitude: placeLon,
                            link: `https://www.openstreetmap.org/?mlat=${placeLat}&mlon=${placeLon}#map=17/${placeLat}/${placeLon}`
                        };
                    })
                    .filter(place => place.latitude && place.longitude);

            } catch (err) {
                console.log("External places error:", err.message);
            }
        }

        let reply = "";

        try {
            const finalResponse = await ai.models.generateContent({
                model: "gemini-1.5-flash",
                contents: `
Write a short friendly reply for LifeBeyond.

User asked: "${message}"

LifeBeyond listings:
${JSON.stringify(listings.map(l => ({
    title: l.title,
    location: l.location,
    country: l.country,
    price: l.price,
    maxGuests: l.maxGuests
})))}

External places:
${JSON.stringify(externalPlaces)}

Weather:
${JSON.stringify(weather)}

Mention LifeBeyond listings first if available.
Mention external places if available.
Mention weather if available.
`
            });

            reply = finalResponse.text;
        } catch (err) {
            console.log("Gemini final reply failed:", err.message);

            reply = "I found some results for you. Please check the listings and external places below.";
        }

        res.json({
            success: true,
            reply,
            preferences,
            listings,
            weather,
            externalPlaces
        });

    } catch (err) {
        console.log("AI assistant error:", err.message);

        res.status(500).json({
            success: false,
            reply: "Sorry, the AI assistant had a problem. Please try again."
        });
    }
});

module.exports = router;