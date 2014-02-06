var uuid           = require('node-uuid');

module.exports = function() {
    return function (req, res, next) {
        if( req.method == 'create' && req.model._id === undefined) {
            req.model._id = uuid.v1();
        }
        next();
    };
};
