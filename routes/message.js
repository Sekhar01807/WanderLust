const express = require("express");
const router = express.Router({ mergeParams: true });
const mongoose = require("mongoose");
const wrapAsync = require("../utils/wrapAsync");
const { isLoggedIn } = require("../middleware");
const Message = require("../models/message");
const Listing = require("../models/listing");
const User = require("../models/user");

// Render Inbox Page
router.get("/", isLoggedIn, (req, res) => {
    res.render("messages/index.ejs");
});

// Get Unique Conversations for Inbox
router.get("/inbox-data", isLoggedIn, wrapAsync(async (req, res) => {
    const messages = await Message.find({
        $or: [{ sender: req.user._id }, { receiver: req.user._id }]
    })
    .sort({ createdAt: -1 })
    .populate("sender", "username profileImage")
    .populate("receiver", "username profileImage")
    .populate("listing", "title");

    // Filter for unique conversations (Last message per user+listing pair)
    const uniqueConvos = [];
    const seen = new Set();

    for (let msg of messages) {
        if (!msg.sender || !msg.receiver) continue;
        const otherUser = msg.sender._id.equals(req.user._id) ? msg.receiver : msg.sender;
        if (!otherUser) continue;
        
        const listingId = msg.listing ? msg.listing._id.toString() : "general";
        const key = `${otherUser._id.toString()}-${listingId}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueConvos.push(msg);
        }
    }

    res.json(uniqueConvos);
}));

// Get Chat History
router.get("/:receiverId", isLoggedIn, wrapAsync(async (req, res) => {
    const { receiverId } = req.params;
    const { listingId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ success: false, message: "Invalid receiver ID" });
    }

    let filter = {
        $or: [
            { sender: req.user._id, receiver: receiverId },
            { sender: receiverId, receiver: req.user._id }
        ]
    };

    if (listingId && mongoose.Types.ObjectId.isValid(listingId)) {
        filter.listing = listingId;
    }
    
    const messages = await Message.find(filter)
        .sort({ createdAt: 1 })
        .populate("sender", "username profileImage");

    // Mark incoming messages as read
    await Message.updateMany(
        { sender: receiverId, receiver: req.user._id, ...(listingId ? { listing: listingId } : {}), isRead: false },
        { $set: { isRead: true } }
    );

    res.json(messages);
}));

// Send Message - Strict Authorization & Content Constraints
router.post("/", isLoggedIn, wrapAsync(async (req, res) => {
    let { receiverId, listingId, content } = req.body;
    
    if (!receiverId || !listingId || !content) {
        return res.status(400).json({ success: false, message: "Missing required fields (receiverId, listingId, or content)" });
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId) || !mongoose.Types.ObjectId.isValid(listingId)) {
        return res.status(400).json({ success: false, message: "Invalid receiver or listing identifier" });
    }

    if (req.user._id.toString() === receiverId.toString()) {
        return res.status(400).json({ success: false, message: "You cannot message yourself" });
    }

    if (typeof content !== "string" || content.trim().length === 0 || content.trim().length > 2000) {
        return res.status(400).json({ success: false, message: "Message content must be between 1 and 2000 characters" });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
        return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
        return res.status(404).json({ success: false, message: "Receiver not found" });
    }

    // Relationship Authorization:
    // 1. If sender is host of listing: host can message anyone contacting them or on their listing.
    // 2. If sender is guest: receiver must be the owner of the listing.
    const isSenderOwner = listing.owner && listing.owner.equals(req.user._id);
    const isReceiverOwner = listing.owner && listing.owner.equals(receiver._id);

    if (!isSenderOwner && !isReceiverOwner) {
        return res.status(403).json({ success: false, message: "Unauthorized: Messages must be directed to the host of this property." });
    }

    const newMessage = new Message({
        sender: req.user._id,
        receiver: receiver._id,
        listing: listing._id,
        content: content.trim()
    });

    await newMessage.save();
    res.json(newMessage);
}));

// Delete Scoped Conversation - Strict Relationship Authorization & Listing Verification
router.delete("/:receiverId", isLoggedIn, wrapAsync(async (req, res) => {
    const { receiverId } = req.params;
    const listingId = req.query.listingId || req.body.listingId;

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
        return res.status(400).json({ success: false, message: "Invalid receiver ID" });
    }

    if (!listingId || !mongoose.Types.ObjectId.isValid(listingId)) {
        return res.status(400).json({ success: false, message: "Valid listing ID is required to scope conversation deletion" });
    }

    const listing = await Listing.findById(listingId);
    if (!listing) {
        return res.status(404).json({ success: false, message: "Listing not found" });
    }

    // Relationship Authorization:
    // Requester must be either the owner/host of the listing or the guest messaging the host
    const isUserOwner = listing.owner && listing.owner.equals(req.user._id);
    const isOtherPartyOwner = listing.owner && listing.owner.equals(receiverId);

    if (!isUserOwner && !isOtherPartyOwner) {
        return res.status(403).json({ 
            success: false, 
            message: "Unauthorized: You can only delete conversations associated with your own listings or hosts you interact with." 
        });
    }

    const filter = {
        listing: listing._id,
        $or: [
            { sender: req.user._id, receiver: receiverId },
            { sender: receiverId, receiver: req.user._id }
        ]
    };

    const result = await Message.deleteMany(filter);

    res.json({ success: true, message: "Conversation deleted", deletedCount: result.deletedCount });
}));

module.exports = router;
