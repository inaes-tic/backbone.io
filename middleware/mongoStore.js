module.exports = function(db, colname, options) {
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
                    var data = {
                        query: {},
                        page: 0,
                        per_page: 0,
                        total_pages: null,
                        total_entries: null,
                        sort_by: { $natural: -1 },
                        order: '',
                        fields: {},
                        criteria: {},
                        max_items: 100
                    };
                    var query = {};
                    var expressions = [];

                    if ('data' in req.options) {
                        data  = _.defaults(req.options.data, data);
                    }

                    query = _.omit(data.query, ['text', 'criteria']);

                    // validations
                    if(options.search) {
                        if(data.fields) {
                            _.map(data.fields, function(field) {
                                var ok = _.contains(options.search.facets, field);
                                if (!ok) {
                                    res.end({'error':'Facet field is not valid - read ' + field});
                                }
                            });
                        }
                        _.map(_.keys(query), function(key) {
                            var ok = _.contains(options.search.facets, key);
                            if (!ok) {
                                res.end({'error':'query field is not valid - read ' + key});
                            }
                        });

                        if(_.has(options.search, 'criteria') && _.has(data.query, 'criteria')) {
                            var criteria_keys   = _.keys(data.query.criteria);
                            var criteria_values = _.values(data.query.criteria);
                            var options_keys    = _.keys(options.search.criteria);
                            var options_values  = _.values(options.search.criteria);

                            if (!(_.difference(criteria_keys, options_keys))) {
                                res.end({'error':'criteria is not valid - read ' + criteria_keys });
                            }

                            if(!(_.every(criteria_values, function(val) { return _.isArray(val); }))) {
                                res.end({'error':'criteria is not an array - read '});
                            }
                        }

                        data.max_items = options.search.max_facets;
                    }

                    //Creating criterias from collection search config and request data
                    if(_.has(data.query, 'criteria')) {
                        var criteria = _.reduce(data.query.criteria, function(memo, criteria, key) {
                            var replace_str = "%value%";
                            var options_key = options.search.criteria[key];
                            _.forEach(criteria, function(param) {
                                options_key = options_key.replace(replace_str, param);
                            });
                            return _.extend(memo, JSON.parse(options_key));
                        }, {});
                        _.extend(query, criteria);
                    }

                    // Creating mongo expression using text search string
                    if(_.has(data.query,'text')) {
                        _.forEach(options.search.fulltext, function(field) {
                            var obj= {};
                            obj[field] = new RegExp(data.query.text);
                            expressions.push(obj);
                        });
                        _.extend(query, {$or: expressions})
                    }

                    //XXX maybe this is not bests option for all cases
                    //check if value is Numeric to change type for search
                    query = _.object( _.keys(query), _.map(query, function(val) {
                        var is_num = !isNaN(parseFloat(val)) && isFinite(val)
                        return (is_num) ? Number(val) : val;
                    }));

                    //Generating prjection to show in mongo way {field1: 1, field2: 1}
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
