const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

let mongoose = null;
try {
    mongoose = require("mongoose");
} catch {
    mongoose = null;
}

function isValidObjectId(id) {
    if (mongoose && mongoose.Types && mongoose.Types.ObjectId) {
        return mongoose.Types.ObjectId.isValid(id);
    }
    return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}

function generateObjectId() {
    if (mongoose && mongoose.Types && mongoose.Types.ObjectId) {
        return new mongoose.Types.ObjectId().toString();
    }
    return crypto.randomBytes(12).toString("hex");
}

/**
 * Helper simulating message deletion authorization check
 */
function validateMessageDeletionAuth({ currentUserId, receiverId, listingId, listingOwnerId }) {
    if (!isValidObjectId(receiverId)) {
        return { authorized: false, status: 400, message: "Invalid receiver ID" };
    }

    if (!listingId || !isValidObjectId(listingId)) {
        return { authorized: false, status: 400, message: "Valid listing ID is required to scope conversation deletion" };
    }

    if (!listingOwnerId) {
        return { authorized: false, status: 404, message: "Listing not found" };
    }

    const isUserOwner = String(currentUserId) === String(listingOwnerId);
    const isOtherPartyOwner = String(receiverId) === String(listingOwnerId);

    if (!isUserOwner && !isOtherPartyOwner) {
        return {
            authorized: false,
            status: 403,
            message: "Unauthorized: You can only delete conversations associated with your own listings or hosts you interact with."
        };
    }

    return {
        authorized: true,
        filter: {
            listing: listingId,
            $or: [
                { sender: currentUserId, receiver: receiverId },
                { sender: receiverId, receiver: currentUserId }
            ]
        }
    };
}

test("Message Deletion - rejects requests missing or with invalid listingId", () => {
    const userId = generateObjectId();
    const receiverId = generateObjectId();

    const missingListing = validateMessageDeletionAuth({
        currentUserId: userId,
        receiverId: receiverId,
        listingId: undefined,
        listingOwnerId: userId
    });
    assert.equal(missingListing.authorized, false);
    assert.equal(missingListing.status, 400);

    const invalidListing = validateMessageDeletionAuth({
        currentUserId: userId,
        receiverId: receiverId,
        listingId: "invalid-objectid",
        listingOwnerId: userId
    });
    assert.equal(invalidListing.authorized, false);
    assert.equal(invalidListing.status, 400);
});

test("Message Deletion - authorizes when requester is host/listing owner", () => {
    const hostId = generateObjectId();
    const guestId = generateObjectId();
    const listingId = generateObjectId();

    const authCheck = validateMessageDeletionAuth({
        currentUserId: hostId,
        receiverId: guestId,
        listingId: listingId,
        listingOwnerId: hostId
    });

    assert.equal(authCheck.authorized, true);
    assert.equal(authCheck.filter.listing, listingId);
});

test("Message Deletion - authorizes when receiver is host/listing owner (requester is guest)", () => {
    const hostId = generateObjectId();
    const guestId = generateObjectId();
    const listingId = generateObjectId();

    const authCheck = validateMessageDeletionAuth({
        currentUserId: guestId,
        receiverId: hostId,
        listingId: listingId,
        listingOwnerId: hostId
    });

    assert.equal(authCheck.authorized, true);
    assert.equal(authCheck.filter.listing, listingId);
});

test("Message Deletion - denies unrelated third parties", () => {
    const thirdPartyId = generateObjectId();
    const randomUserId = generateObjectId();
    const hostId = generateObjectId();
    const listingId = generateObjectId();

    const authCheck = validateMessageDeletionAuth({
        currentUserId: thirdPartyId,
        receiverId: randomUserId,
        listingId: listingId,
        listingOwnerId: hostId
    });

    assert.equal(authCheck.authorized, false);
    assert.equal(authCheck.status, 403);
});
