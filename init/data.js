//Sample listings data use to seed/populate the database
//manually adding the list for testing
const sampleListings = [
    {
        title: "Modern Loft",
        description: "Beautiful city apartment",
        price: 1200,
        location: "London",
        country: "UK"
    },
    {
        title: "Beach House",
        description: "Relax by the sea",
        price: 2000,
        location: "Goa",
        country: "India"
    }
];

//exporting the data so it can be used in index.js
module.exports = { data: sampleListings };