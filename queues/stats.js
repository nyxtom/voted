
/**
 * Module dependencies
 */
var mongo = require('mongojs');
var util = require('util');

var log = require('./../lib/log');
var QueueWorker = require('./../lib/queueWorker');
var config = require('./../config.js').values;
var citiesRepo = require('./../lib/geonames/citiesRepo');
var Place = require('./../lib/geonames/place');
var locationLookup = require('./../lib/geonames/locationLookup');
var utils = require('./../lib/utils');


// Sets up the stats worker as a queue worker with name and id
function StatsWorker() {
    QueueWorker.call(this, 'queue:postitems:stats');
    this.name = function () { return 'Stats Queue'; };
    this.id = function () { return 'fksdjakf32-6702-4341-9db4-ksdfjaksd333'; };
    this.db = utils.getMongoConnection(config.server.SocialConnection, ['postitems']);
};


// All analysis workers are queue workers
util.inherits(StatsWorker, QueueWorker);
module.exports = StatsWorker;

// Parses the queue item data
StatsWorker.prototype.parse = function (data) {
    try {
        var post = JSON.parse(data);
        this.db.postitems.save(post);

        if (post.LocationAttributes.StateCode) {
            this.redisClient.zincrby(['voted-states', 1, post.LocationAttributes.StateCode], function (err, response) {});
        }
        if (post.LocationAttributes.State) {
            this.redisClient.zincrby(['voted-state', 1, post.LocationAttributes.State], function (err, response) {});
        }
        if (post.LocationAttributes.Country) {
            this.redisClient.zincrby(['voted-countries', 1, post.LocationAttributes.Country], function (err, response) {});
        }

        if (post.Author) {
            this.redisClient.zincrby(['voting-authors', 1, post.Author], function (err, response) {});
        }
    }
    catch (err) {
        log('ERROR', err);
    }
};


function main() {
    var worker = new StatsWorker();
    worker.run();
};

main();
