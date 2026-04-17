const Joi = require("joi");

module.exports.listingSchema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().required(),
    image: Joi.string().allow("", null),
    price: Joi.number().required().min(0),
    location: Joi.string().required(),
    country: Joi.string().required(),
    latitude: Joi.number().allow("", null),
    longitude: Joi.number().allow("", null)
});

module.exports.userSchema = Joi.object({
    username: Joi.string().required().min(3),
    email: Joi.string().email().required(),
    password: Joi.string().required().min(6)
});

module.exports.reviewSchema = Joi.object({
    comment: Joi.string().required(),
    rating: Joi.number().required().min(1).max(5)
});