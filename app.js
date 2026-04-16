const express = require("express");
const path = require("path");
const ejsMate = require("ejs-mate");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const bcrypt = require("bcryptjs");
const { listingSchema, userSchema } = require("./schema");

const Listing = require("./models/listing");
const User = require("./models/user");

const app = express();

const MONGO_URL = "mongodb://127.0.0.1:27017/lifebeyond";

// Connect to MongoDB
mongoose.connect(MONGO_URL)
    .then(() => {
        console.log("Connected to DB");
    })
    .catch((err) => {
        console.log(err);
    });

// Session store
const store = MongoStore.create({
    mongoUrl: MONGO_URL,
    crypto: {
        secret: "mysecretkey"
    },
    touchAfter: 24 * 3600
});

const sessionOptions = {
    store,
    secret: "mysecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true
    }
};

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(session(sessionOptions));

// EJS setup
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Make current user available in all EJS files
app.use((req, res, next) => {
    res.locals.currentUser = req.session.userId;
    next();
});

// LOGIN CHECK MIDDLEWARE
const isLoggedIn = (req, res, next) => {
    if (!req.session.userId) {
        return res.redirect("/login");
    }
    next();
};

// OWNER CHECK MIDDLEWARE
const isOwner = async (req, res, next) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        return res.redirect("/");
    }

    if (!listing.owner || !listing.owner.equals(req.session.userId)) {
        return res.redirect(`/listings/${id}`);
    }

    next();
};

const validateListing = (req, res, next) => {
    const { error } = listingSchema.validate(req.body);
    if (error) {
        return res.send(error.details[0].message);
    }
    next();
};

const validateUser = (req, res, next) => {
    const { error } = userSchema.validate(req.body);
    if (error) {
        return res.send(error.details[0].message);
    }
    next();
};

// HOME - show all listings
app.get("/", async (req, res) => {
    const listings = await Listing.find({});
    res.render("listings/index", { listings });
});

// NEW FORM
app.get("/listings/new", isLoggedIn, (req, res) => {
    res.render("listings/new");
});

// CREATE
app.post("/listings", isLoggedIn, validateListing, async (req, res) => {
    const newListing = new Listing(req.body);
    newListing.owner = req.session.userId;
    await newListing.save();
    res.redirect("/");
});

// SHOW - view single listing
app.get("/listings/:id", async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id).populate("owner");

    if (!listing) {
        return res.redirect("/");
    }

    res.render("listings/show", { listing });
});

// EDIT FORM
app.get("/listings/:id/edit", isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;
    const listing = await Listing.findById(id);

    if (!listing) {
        return res.redirect("/");
    }

    res.render("listings/edit", { listing });
});

// UPDATE
app.put("/listings/:id", isLoggedIn, isOwner, validateListing, async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndUpdate(id, req.body);
    res.redirect(`/listings/${id}`);
});

// DELETE
app.delete("/listings/:id", isLoggedIn, isOwner, async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndDelete(id);
    res.redirect("/");
});

// REGISTER FORM
app.get("/register", (req, res) => {
    res.render("users/register");
});

// REGISTER USER
app.post("/register", validateUser, async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = new User({
        username,
        email,
        password: hashedPassword
    });

    await newUser.save();
    req.session.userId = newUser._id;
    res.redirect("/");
});

// LOGIN FORM
app.get("/login", (req, res) => {
    res.render("users/login");
});

// LOGIN USER
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        return res.send("Invalid email or password");
    }

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
        return res.send("Invalid email or password");
    }

    req.session.userId = user._id;
    res.redirect("/");
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// Server
app.listen(8080, () => {
    console.log("Server is listening on port 8080");
});