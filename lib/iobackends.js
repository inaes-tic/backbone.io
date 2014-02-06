var _              = require('underscore'),
    uuid           = require('node-uuid'),
    backboneio     = require('backbone.io'),
    config         = require('config'),
    search_options = config.Search,
    collections    = config.Common.Collections,
    logger         = require("../logger")().addLogger('iobackends')
    publisher      = require('../pubsub')();
    iocompat       = require('./iocompat');
;

var iobackends = module.exports = exports = function (db, backends) {
    var self = this;

    if(_.isUndefined(backends) || _.isEmpty(backends)) {
        logger.info("Backends are missing");
    }

    this.backends = backends;

    /* process the backends object to streamline code */
    _(this.backends).each (function (backend, name) {
        backend.io = backboneio.createBackend();
        if (backend.use) {
            _(backend.use).each (function (usefn) {
                backend.io.use(usefn);
            });
        }


        /* adds a debugging middleware before the storage (see below) */
        backend.io.use (self.middleware.debug);

        /*
         * adds the io compatibility layer middleware that forwards changes
         * from the browser as events so we can react and update our models.
         */
        backend.io.use (iocompat.eventMiddleware(backend));

        /*
         * adds the redis link layer middleware that listens for changes on
         * other servers and also broadcasts ours.
         */
        if (backend.redis) {
            backend.io.use (iocompat.redisMiddleware(backend, name, backend.redis.chain));
        }

        /*
         * On the backend definition we either pass a 'mongo' hash with the
         * connection details or a middleware that stores data.
         *
         * This is so because most of the storage middlewares end up doing
         * a res.end() stopping the processing there and sometimes we want
         * things like the debugbackend to work.
         */

        if (backend.store) {
            backend.io.use(backend.store);
        }
    });

};

iobackends.prototype.emit = function (name, args) {
    var backend = this.backends[name];
    if (backend) {
        var _io = backend.io;
        _io.emit.apply(_io, args);
    } else {
        logger.error('iobackends.emit() no such backend:', name);
    }
};

iobackends.prototype.get_ios = function () {
    var ret = {};
    var self = this;
    _(_.keys(this.backends)).each (function (backend) {
        ret[backend + 'backend'] = self.backends[backend].io;
    });
    return ret;
};

iobackends.prototype.get = function (name) {
    return this.backends[name];
};

iobackends.prototype.get_middleware = function () {
    return this.middleware;
};

iobackends.prototype.patchBackbone = function () {
    return iocompat.patchBackbone(this);
};
