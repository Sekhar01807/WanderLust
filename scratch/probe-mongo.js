const MongoStore = require('connect-mongo');
console.log("MongoStore Type:", typeof MongoStore);
console.log("MongoStore Keys:", Object.keys(MongoStore));
if (MongoStore.create) {
    console.log("Found .create() method");
} else if (typeof MongoStore === 'function') {
    console.log("MongoStore is a function (Legacy Style)");
} else {
    console.log("No standard methods found. Full object:", MongoStore);
}
