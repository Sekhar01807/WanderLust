class ExpressError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.statuscode = statusCode;
        this.message = message;
    }
}

module.exports = ExpressError;