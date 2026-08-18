const sgMail = require('@sendgrid/mail');
const nodemailer = require("nodemailer");

// Configure SendGrid SDK
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY.trim());
    console.log("✅ Email Service: SENDGRID SDK (Web API Mode)");
} else {
    console.log("⚠️  Email Service: MAILTRAP / GMAIL MODE");
}

// Shared Styling for Premium Emails
const emailStyles = `
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #ff385c, #e03150); padding: 30px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 28px; letter-spacing: 1px; }
    .content { padding: 40px; background: #fff; }
    .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999; }
    .btn { display: inline-block; padding: 14px 30px; background: #ff385c; color: #fff !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
    .info-box { background: #fef1f2; border-left: 4px solid #ff385c; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .footer-links a { color: #ff385c; text-decoration: none; margin: 0 10px; }
`;

const sendViaGmail = async (msg) => {
    const user = process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com";
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!pass) {
        return false;
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });

    try {
        const info = await transporter.sendMail({
            from: `"WanderLust" <${user}>`,
            to: msg.to,
            subject: msg.subject,
            html: msg.html
        });
        console.log(`🚀 REAL-TIME EMAIL DELIVERED via Gmail SMTP to: ${msg.to} (ID: ${info.messageId})`);
        return true;
    } catch (err) {
        console.error("❌ Gmail SMTP Delivery Error:", err.message);
        return false;
    }
};

const sendViaSendGrid = async (msg) => {
    try {
        const response = await sgMail.send(msg);
        console.log(`🚀 SENT: Email delivered via SendGrid to: ${msg.to}`);
        return true;
    } catch (error) {
        console.error("❌ SendGrid SDK Error:", error.message);
        return false;
    }
};

const sendViaMailtrap = async (mailOptions) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return;
    }
    const transporter = nodemailer.createTransport({
        host: "sandbox.smtp.mailtrap.io",
        port: 2525,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    try {
        await transporter.sendMail(mailOptions);
        console.log(`📥 MAILTRAP SANDBOX: Email captured in Mailtrap inbox for ${mailOptions.to}`);
    } catch (error) {
        console.error("❌ Mailtrap Error:", error.message);
    }
};

const { getAppUrl } = require("./appUrl");

const dispatchEmail = async (msg) => {
    // 1. Try Gmail SMTP first if GMAIL_APP_PASSWORD is set in .env
    const gmailSuccess = await sendViaGmail(msg);
    if (gmailSuccess) return;

    // 2. Try SendGrid if API key is active
    if (process.env.SENDGRID_API_KEY) {
        const sendgridSuccess = await sendViaSendGrid(msg);
        if (sendgridSuccess) return;
    }

    // 3. Fallback to Mailtrap Sandbox
    await sendViaMailtrap(msg);
};

module.exports.sendWelcomeEmail = async (user, req) => {
    const baseUrl = getAppUrl(req);
    const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: "Welcome to WanderLust! 🌍",
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>WanderLust</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Hi ${user.username}!</h2>
                            <p>We're absolutely thrilled to have you join our global community of adventurers. Your journey to finding the most unique stays around the world starts today.</p>
                            <p>Whether you're looking for a cozy cabin or a luxury villa, WanderLust has the perfect place waiting for you.</p>
                            <a href="${baseUrl}/listings" class="btn">Start Exploring Now</a>
                        </div>
                        <div class="footer">
                            <p>&copy; 2026 WanderLust Inc. | All rights reserved.</p>
                            <div class="footer-links">
                                <a href="#">Terms</a> • <a href="#">Privacy</a> • <a href="#">Help Center</a>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};

module.exports.sendBookingEmail = async (user, booking, listing, req) => {
    const baseUrl = getAppUrl(req);
    const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: "Your Adventure is Confirmed! 🎉",
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Booking Confirmed</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Get Your Bags Ready, ${user.username}!</h2>
                            <p>Your reservation at <strong>${listing.title}</strong> is officially confirmed. We've notified the host and everything is set for your arrival.</p>
                            
                            <div class="info-box">
                                <p style="margin: 5px 0;"><strong>📍 Location:</strong> ${listing.location}, ${listing.country}</p>
                                <p style="margin: 5px 0;"><strong>📅 Check-in:</strong> ${new Date(booking.checkIn).toDateString()}</p>
                                <p style="margin: 5px 0;"><strong>📅 Check-out:</strong> ${new Date(booking.checkOut).toDateString()}</p>
                                <p style="margin: 5px 0; color: #ff385c;"><strong>💰 Total Paid:</strong> ₹${booking.totalPrice.toLocaleString("en-IN")}</p>
                            </div>

                            <p>You can manage your booking and message the host directly from your dashboard.</p>
                            <a href="${baseUrl}/profile" class="btn">View Booking Details</a>
                        </div>
                        <div class="footer">
                            <p>Need help? Contact our 24/7 support team.</p>
                            <p>&copy; 2026 WanderLust Inc. | All rights reserved.</p>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};

module.exports.sendHostBookingNotificationEmail = async (host, guest, booking, listing, req) => {
    const baseUrl = getAppUrl(req);
    const msg = {
        to: host.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: `🎉 New Reservation Received for ${listing.title}!`,
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>New Reservation!</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Great news, ${host.username}!</h2>
                            <p><strong>@${guest.username}</strong> has just booked your property <strong>${listing.title}</strong>.</p>
                            
                            <div class="info-box">
                                <p style="margin: 5px 0;"><strong>👤 Guest:</strong> ${guest.username} (${guest.email})</p>
                                <p style="margin: 5px 0;"><strong>📅 Check-in:</strong> ${new Date(booking.checkIn).toDateString()}</p>
                                <p style="margin: 5px 0;"><strong>📅 Check-out:</strong> ${new Date(booking.checkOut).toDateString()}</p>
                                <p style="margin: 5px 0;"><strong>👥 Guest Count:</strong> ${booking.guests} Guest(s)</p>
                                <p style="margin: 5px 0; color: #28a745;"><strong>💰 Host Earnings:</strong> ₹${booking.totalPrice.toLocaleString("en-IN")}</p>
                            </div>

                            <p>You can view full reservation details and message your guest directly from your host dashboard.</p>
                            <a href="${baseUrl}/profile" class="btn">View Reservation Details</a>
                        </div>
                        <div class="footer">
                            <p>&copy; 2026 WanderLust Inc. | Host Management System</p>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};

module.exports.sendCancellationEmail = async (user, booking, listing, req) => {
    const baseUrl = getAppUrl(req);
    const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: "Reservation Cancellation Confirmed ❌",
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header" style="background: linear-gradient(135deg, #6c757d, #343a40);">
                            <h1>Trip Cancelled</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Hi ${user.username},</h2>
                            <p>Your reservation at <strong>${listing.title}</strong> has been cancelled as requested.</p>
                            
                            <div class="info-box" style="border-left-color: #dc3545; background: #fff5f5;">
                                <p style="margin: 5px 0;"><strong>📍 Property:</strong> ${listing.title} (${listing.location})</p>
                                <p style="margin: 5px 0;"><strong>📅 Original Dates:</strong> ${new Date(booking.checkIn).toDateString()} - ${new Date(booking.checkOut).toDateString()}</p>
                                <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">Cancelled</span></p>
                            </div>

                            <p>We hope to welcome you back on your next adventure!</p>
                            <a href="${baseUrl}/listings" class="btn" style="background-color: #343a40; color: #fff !important;">Explore Other Stays</a>
                        </div>
                        <div class="footer">
                            <p>&copy; 2026 WanderLust Inc. | Customer Support</p>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};

module.exports.sendWaitlistAvailableEmail = async (user, listing, req) => {
    const baseUrl = getAppUrl(req);
    const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: `🎉 Dates Now Available for ${listing.title}!`,
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header" style="background: linear-gradient(135deg, #28a745, #218838);">
                            <h1>Dates Freed Up!</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Great News, ${user.username}!</h2>
                            <p>A previous reservation for <strong>${listing.title}</strong> was just cancelled. The property is now available for booking!</p>
                            
                            <div class="info-box" style="border-left-color: #28a745; background: #e8f5e9;">
                                <p style="margin: 5px 0;"><strong>📍 Stay:</strong> ${listing.title} (${listing.location})</p>
                                <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Open for Booking</span></p>
                            </div>

                            <p>Book now before someone else reserves these dates!</p>
                            <a href="${baseUrl}/listings/${listing._id}" class="btn" style="background-color: #28a745; color: #fff !important;">Book ${listing.title} Now</a>
                        </div>
                        <div class="footer">
                            <p>&copy; 2026 WanderLust Inc. | Priority Availability Notification</p>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};

module.exports.sendTripReminder = async (user, listing, daysDiff) => {
    const baseUrl = getAppUrl();
    const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: `Reminder: Your stay at ${listing ? listing.title : 'WanderLust'} is in ${daysDiff} day${daysDiff > 1 ? 's' : ''}! ✈️`,
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Upcoming Trip Reminder</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Hi ${user.username}!</h2>
                            <p>Your exciting trip to <strong>${listing ? listing.title : 'your destination'}</strong> is coming up in <strong>${daysDiff} day${daysDiff > 1 ? 's' : ''}</strong>.</p>
                            <p>Make sure you have everything ready for check-in.</p>
                            <a href="${baseUrl}/profile" class="btn">View Reservation</a>
                        </div>
                        <div class="footer">
                            <p>&copy; 2026 WanderLust Inc. | Automated Travel Reminders</p>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};

module.exports.sendPasswordResetEmail = async (user, resetToken, req) => {
    const baseUrl = getAppUrl(req);
    const resetUrl = `${baseUrl}/reset/${resetToken}`;
    
    const msg = {
        to: user.email,
        from: process.env.FROM_EMAIL || "sekharsekhar1919@gmail.com",
        subject: "Secure Password Reset 🔒",
        html: `
            <html>
                <head><style>${emailStyles}</style></head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Security Reset</h1>
                        </div>
                        <div class="content">
                            <h2 style="color: #222;">Password Reset Request</h2>
                            <p>We received a request to reset the password for your WanderLust account. Click the button below to choose a new password.</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${resetUrl}" class="btn" style="background-color: #ff385c; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset My Password</a>
                            </div>
                            <p style="font-size: 13px; color: #666; word-break: break-all;">Or copy and paste this URL into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
                            <p style="margin-top: 30px; font-size: 13px; color: #888;">If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; 2026 WanderLust Inc. | All rights reserved.</p>
                        </div>
                    </div>
                </body>
            </html>
        `,
    };

    await dispatchEmail(msg);
};
