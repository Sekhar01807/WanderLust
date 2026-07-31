if (process.env.NODE_ENV !== "production") {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
}
const mongoose = require("mongoose");
const Listing = require("../models/listing.js");
const User = require("../models/user.js");

const dbUrl = process.env.ATLASDB_URL;

const newProperties = [
    {
        title: "Maldives Luxury Overwater Villa",
        description: "Wake up to crystal-clear turquoise ocean waters, a private infinity pool, and direct coral reef access right from your deck.",
        image: {
            filename: "maldives_villa",
            url: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80"
        },
        price: 24500,
        location: "Male",
        country: "Maldives",
        category: "beachfront",
        geometry: { type: "Point", coordinates: [73.5093, 4.1755] }
    },
    {
        title: "Glamping Dome under Starlit Skies",
        description: "Experience luxury wilderness camping with transparent heated glass domes, private fire pit, and breathtaking mountain views.",
        image: {
            filename: "glamping_dome",
            url: "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=1200&q=80"
        },
        price: 8900,
        location: "Manali",
        country: "India",
        category: "camping",
        geometry: { type: "Point", coordinates: [77.1887, 32.2432] }
    },
    {
        title: "Royal Edinburgh Historic Castle Suite",
        description: "Live like royalty in a restored 16th-century grand fortress featuring antique fireplaces, vaulted dining halls, and hilltop vistas.",
        image: {
            filename: "edinburgh_castle",
            url: "https://images.unsplash.com/photo-1585543805890-6051f7829f98?auto=format&fit=crop&w=1200&q=80"
        },
        price: 32000,
        location: "Edinburgh",
        country: "United Kingdom",
        category: "castles",
        geometry: { type: "Point", coordinates: [-3.1883, 55.9533] }
    },
    {
        title: "Tromsø Heated Glass Igloo & Aurora Hideaway",
        description: "Immerse yourself in a frozen arctic wonderland with 360-degree panoramic views of the dancing Northern Lights.",
        image: {
            filename: "tromso_igloo",
            url: "https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=1200&q=80"
        },
        price: 19800,
        location: "Tromso",
        country: "Norway",
        category: "arctic",
        geometry: { type: "Point", coordinates: [18.9553, 69.6492] }
    }
];

async function seedNewCategories() {
    try {
        await mongoose.connect(dbUrl);
        console.log("Connected to Atlas DB for category seeding...");

        let ownerUser = await User.findOne();
        let ownerId = ownerUser ? ownerUser._id : "672ef4689a83bb82eac61046";

        for (let prop of newProperties) {
            const exists = await Listing.findOne({ title: prop.title });
            if (!exists) {
                const listing = new Listing({
                    ...prop,
                    owner: ownerId
                });
                await listing.save();
                console.log(`Successfully seeded: ${prop.title} [Category: ${prop.category}]`);
            } else {
                console.log(`Already exists: ${prop.title}`);
            }
        }
        console.log("Category seeding complete!");
        process.exit(0);
    } catch (err) {
        console.error("Seeding failed:", err);
        process.exit(1);
    }
}

seedNewCategories();
