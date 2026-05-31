//Gemini AI chatbot assistant

// Import Express framework
const express = require("express");

// Create router object for assistant routes
const router = express.Router();

// Import Gemini AI package
const { GoogleGenAI } = require("@google/genai");

// Import Axios for API requests - communicates with weather API
const axios = require("axios");

// Import Listing model from database
const Listing = require("../models/listing");

// Import login middleware
const { isLoggedIn } = require("../middleware");

// Create Gemini AI instance using API key from .env
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// Function to clean Gemini response
// Removes markdown formatting from AI JSON response
function cleanGeminiJson(text) {
    return text
        .trim()
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
}

// Backup function if Gemini fails
// Tries to extract simple preferences manually
function fallbackPreferences(message) {

    // Convert message to lowercase
    const lower = message.toLowerCase();

    // Default empty location
    let location = "";

    // Detect words after "near"
    const nearMatch = lower.match(/near\s+([a-z\s]+)/i);

    // If location found
    if (nearMatch) {
        location = nearMatch[1].trim();
    }

    // Return fallback preferences
    return {
        location,
        country: "",
        budget: null,
        guests: null,
        stayType: "",
        preferences: [],
        weatherPreference: "",

        // Detect if user wants nearby/external places
        wantsExternalPlaces:
            lower.includes("external") ||
            lower.includes("hotel") ||
            lower.includes("nearby") ||
            lower.includes("place")
    };
}

// Main AI assistant route
router.post("/assistant/chat", isLoggedIn, async (req, res) => {

    try {

        // Get user message from frontend
        const { message } = req.body;

        // Prevent empty messages
        if (!message || message.trim() === "") {
            return res.status(400).json({
                success: false,
                reply: "Please type what kind of stay you are looking for."
            });
        }

        // Store extracted user preferences
        let preferences;

        // Try using Gemini AI
        try {

            // Send prompt to Gemini AI
            const aiResponse = await ai.models.generateContent({

                // Gemini model
                model: "gemini-2.5-flash",

                // AI prompt
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

            // Convert AI text into JSON object
            preferences = JSON.parse(cleanGeminiJson(aiResponse.text));

        } catch (err) {

            // If Gemini fails use fallback logic
            console.log("Gemini JSON extraction failed:", err.message);

            preferences = fallbackPreferences(message);
        }

        // Extra manual location detection
        // Helps if AI misses location
        if (!preferences.location) {

            const lower = message.toLowerCase();

            // List of known locations
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

            // Check if message contains any location
            const foundLocation = locations.find(loc => lower.includes(loc));

            // Save location
            if (foundLocation) {
                preferences.location = foundLocation;
            }
        }

        // MongoDB filter object
        let filter = {};

        // Search listings using location
        if (preferences.location) {

            filter.$or = [

                // Match listing location
                { location: { $regex: preferences.location, $options: "i" } },

                // Match country
                { country: { $regex: preferences.location, $options: "i" } },

                // Match title
                { title: { $regex: preferences.location, $options: "i" } },

                // Match description
                { description: { $regex: preferences.location, $options: "i" } }
            ];
        }

        // Filter by maximum budget
        if (preferences.budget) {
            filter.price = { $lte: Number(preferences.budget) };
        }

        // Filter by guest capacity
        if (preferences.guests) {
            filter.maxGuests = { $gte: Number(preferences.guests) };
        }

        // Find matching listings from database
        const listings = await Listing.find(filter)
            .populate("reviews")
            .limit(5);

        // Variables for weather and nearby places
        let weather = null;
        let externalPlaces = [];
        let lat = null;
        let lon = null;

        // If location exists
        if (preferences.location) {

            try {

                // Convert location into coordinates
                const geo = await axios.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    {
                        params: {
                            name: preferences.location,
                            count: 1
                        }
                    }
                );

                // If coordinates found
                if (geo.data.results && geo.data.results.length > 0) {

                    lat = geo.data.results[0].latitude;
                    lon = geo.data.results[0].longitude;

                    // Fetch weather data
                    const weatherResponse = await axios.get(
                        "https://api.open-meteo.com/v1/forecast",
                        {
                            params: {
                                latitude: lat,
                                longitude: lon,
                                current_weather: true
                            }
                        }
                    );

                    // Save weather data
                    weather = weatherResponse.data.current_weather;
                }

            } catch (err) {

                // Weather API error
                console.log("Weather/geocoding error:", err.message);
            }
        }

        // Fetch nearby external hotels/places
        if (lat && lon) {

            try {

                // OpenStreetMap Overpass query
                const overpassQuery = `
[out:json][timeout:25];
(
  nwr["tourism"~"hotel|guest_house|hostel|motel|apartment"](around:12000,${lat},${lon});
  nwr["building"~"hotel|apartments"](around:12000,${lat},${lon});
);
out center 10;
`;

                // Send request to Overpass API
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

                // Clean and format nearby places
                externalPlaces = overpassResponse.data.elements

                    // Keep places with names
                    .filter(place => place.tags && place.tags.name)

                    // Limit results
                    .slice(0, 6)

                    // Convert into simple object
                    .map(place => {

                        const placeLat = place.lat || place.center?.lat;
                        const placeLon = place.lon || place.center?.lon;

                        return {
                            name: place.tags.name,
                            type: place.tags.tourism || place.tags.building || "accommodation",
                            latitude: placeLat,
                            longitude: placeLon,

                            // OpenStreetMap link
                            link:
`https://www.openstreetmap.org/?mlat=${placeLat}&mlon=${placeLon}#map=17/${placeLat}/${placeLon}`
                        };
                    })

                    // Remove invalid coordinates
                    .filter(place => place.latitude && place.longitude);

            } catch (err) {

                // External places API error
                console.log("External places error:", err.message);
            }
        }

        // Final AI response text
        let reply = "";

        try {

            // Ask Gemini to create friendly response
            const finalResponse = await ai.models.generateContent({

                model: "gemini-2.5-flash",

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

Rules:
- Mention LifeBeyond listings first if available.
- Do not write full URLs in the reply.
- Do not list all external places in the reply.
- Keep the reply under 3 short sentences.
- Tell the user to use the cards below for maps and listings.
- Do not use markdown bold symbols like **.
- Mention weather briefly if available.
`
            });

            // Save AI reply
            reply = finalResponse.text;

        } catch (err) {

            // If Gemini response fails
            console.log("Gemini final reply failed:", err.message);

            reply =
                "I found some results for you. Please check the listings and external places below.";
        }

        // Send final data back to frontend
        res.json({
            success: true,
            reply,
            preferences,
            listings,
            weather,
            externalPlaces
        });

    } catch (err) {

        // Main assistant error
        console.log("AI assistant error:", err.message);

        res.status(500).json({
            success: false,
            reply: "Sorry, the AI assistant had a problem. Please try again."
        });
    }
});

// Export router
module.exports = router;