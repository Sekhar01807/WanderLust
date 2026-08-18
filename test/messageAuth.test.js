const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

/**
 * Helper simulating message deletion authorization check
 */
function validateMessageDeletionAuth({ currentUserId, receiverId, listingId, listingOwnerId }) {
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return { authorized: false, status: 400, message: "Invalid receiver ID" };
    }

    if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
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
    const userId = new mongoose.Types.ObjectId().toString();
    const receiverId = new mongoose.Types.ObjectId().toString();

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
    const hostId = new mongoose.Types.ObjectId().toString();
    const guestId = new mongoose.Types.ObjectId().toString();
    const listingId = new mongoose.Types.ObjectId().toString();

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
    const hostId = new mongoose.Types.ObjectId().toString();
    const guestId = new mongoose.Types.ObjectId().toString();
    const listingId = new mongoose.Types.ObjectId().toString();

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
    const thirdPartyId = new mongoose.Types.ObjectId().toString();
    const randomUserId = new mongoose.Types.ObjectId().toString();
    const hostId = new mongoose.Types.ObjectId().toString();
    const listingId = new mongoose.Types.ObjectId().toString();

    const authCheck = validateMessageDeletionAuth({
        currentUserId: thirdPartyId,
        receiverId: randomUserId,
        listingId: listingId,
        listingOwnerId: hostId
    });

    assert.equal(authCheck.authorized, false);
    assert.equal(authCheck.status, 403);
});
