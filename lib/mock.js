var url = require("url"),
    assert = require("assert"),
    EventEmitter = require("events").EventEmitter,
    util = require("util"),
    strata = require("./index"),
    BufferedStream = require("./bufferedstream"),
    lint = require("./lint"),
    utils = require("./utils");

exports.env = makeEnv;
exports.request = request;
exports.stream = stream;

/**
 * A wrapper for +strata.env+ that allows a URL string to be given as `opts`
 * instead of a traditional object. This string will be used for the protocol,
 * serverName, serverPort, pathInfo, and queryString environment variables.
 */
function makeEnv(opts) {
    opts = opts || {};

    // If opts is a string, it specifies a URL.
    if (typeof opts == "string") {
        var uri = url.parse(opts);

        opts = {
            protocol: uri.protocol,
            serverName: uri.hostname,
            serverPort: uri.port,
            pathInfo: uri.pathname,
            queryString: uri.query
        };
    }

    return strata.env(opts);
}

/**
 * Calls the given `callback` with the result of sending a mock request to the
 * given `app`. Creates the environment to use from the given `opts`. Set
 * `opts.lint` to `true` to wrap the `app` in a lint middleware.
 */
function request(opts, app, callback) {
    opts = opts || {};
    app = app || utils.empty;
    callback = callback || function (status, headers, body) {};

    // The app may be any object that has a toApp method (e.g. a Builder).
    if (typeof app.toApp == "function") {
        app = app.toApp();
    }

    if (typeof app != "function") {
        throw new strata.Error("App must be a function");
    }

    if (opts.lint) {
        app = lint(app);
    }

    var env = makeEnv(opts);

    app(env, function (status, headers, body) {
        var isEmpty = env.requestMethod == "HEAD" || utils.emptyBody(status);

        if (isEmpty) {
            body = "";
            headers["Content-Length"] = "0";
        }

        if (typeof body == "string" || opts.stream) {
            callback(null, status, headers, body);
            return;
        }

        // Buffer the body of the response for easy async testing.
        var contents = "";

        if (typeof body.resume == "function") {
            body.resume();
        }

        body.on("data", function (buffer) {
            contents += buffer.toString("utf8");
        });

        body.on("end", function () {
            callback(null, status, headers, contents);
        });
    });
}

/**
 * Returns a new FlushingStream that simply appends all data received to the
 * `data` property of the given object. Useful for collecting the contents of
 * streams when testing.
 */
function stream(obj) {
    obj.data = "";

    var stream = new FlushingStream;

    stream.on("data", function (chunk) {
        obj.data += chunk.toString();
    });

    return stream;
}

/**
 * A subclass of BufferedStream that immediately flushes all writes.
 */
function FlushingStream() {
    BufferedStream.apply(this, arguments);
}

util.inherits(FlushingStream, BufferedStream);

FlushingStream.prototype.write = function () {
    BufferedStream.prototype.write.apply(this, arguments);
    this.flush();
}
