// Import Joi for validation
const Joi = require("joi");

// 🏠 Listing validation schema
// Ensures all listing data is correct before saving to DB
module.exports.listingSchema = Joi.object({
    title: Joi.string().required(), // listing must have a title
    description: Joi.string().required(), // description is required
    image: Joi.string().allow("", null), // image is optional
    price: Joi.number().required().min(0), // price must be positive
    location: Joi.string().required(), // location required
    country: Joi.string().required(), // country required
    latitude: Joi.number().allow("", null), // optional for map feature
    longitude: Joi.number().allow("", null) // optional for map feature
});

// 👤 User validation schema (registration)
module.exports.userSchema = Joi.object({
    username: Joi.string().required().min(3), // minimum 3 characters
    email: Joi.string().email().required(), // must be valid email format
    password: Joi.string().required().min(6) // minimum 6 characters
});

// ⭐ Review validation schema
module.exports.reviewSchema = Joi.object({
    comment: Joi.string().required(), // review text required
    rating: Joi.number().required().min(1).max(5) // rating between 1–5
});