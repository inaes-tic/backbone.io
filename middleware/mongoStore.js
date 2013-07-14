module.exports = function(db, colname) {
    var mongo = require('mongoskin');
    var _ = require('underscore');

    var self = this;
    if (typeof db == "string") {
        var db = mongo.db('localhost:27017/' + db + '?auto_reconnect', {safe:true});
    } else if (! db instanceof mongo.Db) {
        console.error ("db must be a mongo.Db or a string.");
        return new Error("wrong db object");
    }

    // cache up all this, it's just syntactical
    var collection = db.collection(colname);

    var query_id = function(id) {
        try {
            return {$in: [id, mongo.ObjectID(id)]};
        }
        catch (e) {
            return id;
        }
    };

    return function(req, res, next) {
        var callback = function(err, result) {
            if (err) return next(err);
            res.end(result);
        };

        var crud = {
            create: function() {
                var item = req.model;
                collection.insert(item, {safe:true}, function(err, result) {
                    if (err) {
                        res.end({'error':'An error has occurred on create ' + err});
                    } else {
                        res.end(result[0]);
                    }
                });
            },

            read: function() {
                console.log ('READ', req);
                if (req.model._id) {
                    var id = query_id(req.model._id);
                    collection.findOne({'_id': id}, function(err, item) {
                        if (err) {
                            res.end({'error':'An error has occurred on read ' + err});
                        } else {
                            res.end(item);
                        }
                    });
                } else {
                    var data = { query: {}, page: 0, per_page: 0, total_pages: null, total_entries: null, sort_by: { $natural: -1 }, order: '', fields: {}, max_items: 100  };
                    data  = _.defaults(req.options.data, data);

                    var query = {};
                    query = _.omit(data.query, 'text');

                    var fields = _.object(data.fields, _.map(data.fields, function(i) { return 1; }));

                    var sort = data.sort_by;
                    if(data.sort_by && data.order) {
                        sort[data.sort_by] = data.order;
                    }

                    var limit = data.per_page || data.max_items;
                    var skip = data.page * data.per_page;

                    var q = collection.find(query, fields).limit(limit).skip(skip).sort(sort);

                    q.count(function(err, total) {
                        if (err) {
                            res.end({'error':'An error has occurred on count - read ' + err});
                        } else {
                            q.toArray(function (err, items) {
                                if (err) {
                                    res.end({'error':'An error has occurred on read ' + err});
                                } else {
                                    res.end([ { total_entries: total }, items]);
                                }
                            });
                        }
                    });
                }
            },

            update: function() {
                var item = {};
                for (var key in req.model) {
                    item[key] = req.model[key];
                }
                delete item._id;

                var id = query_id(req.model._id);

                console.log(JSON.stringify(item));
                collection.update({'_id': id}, item, {safe:true}, function(err, result) {
                    if (err) {
                        res.end({'error':'An error has occurred on update ' + err});
                    } else {
                        res.end(item);
                    }
                });
            },

            delete: function() {
                var id = query_id(req.model._id);
                collection.remove({'_id': id}, {safe:true}, function(err, result) {
                    if (err) {
                        res.end({'error':'An error has occurred on delete' + err});
                    } else {
                        res.end(req.model);
                    }
                });
            }
        };

        if (!crud[req.method]) return next(new Error('Unsuppored method ' + req.method));
        crud[req.method]();
    }
};
