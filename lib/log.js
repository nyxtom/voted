
/**
 * Module dependencies
 */

var mongo = require('mongojs');
var config = require('./../config');

var db = mongo.connect(config.LogConnection, ['log']);

module.exports = function log(level, message) {
    var data = {
        'timestamp': new Date(),
        'level': level,
        'message': message,
        'exception': {
            'message': message,
            'stackTrace': (new Error().stack)
        },
    };

    db.log.insert(data);
};
