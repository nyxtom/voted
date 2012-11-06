
/**
 * Module dependencies
 */
var mongo = require('mongojs');
var util = require('util');

var log = require('./../lib/log');
var QueueWorker = require('./../lib/queueWorker');
var config = require('./../config.js').values;
var Cities = require('./../lib/geonames/citiesRepo');
var Place = require('./../lib/geonames/place');
var locationLookup = require('./../lib/geonames/locationLookup');


// Sets up the worker as a queue worker with name and id
function AnalysisWorker() {
    QueueWorker.call(this, 'queue:postitems:analysis');
    this.name = function () { return 'Analysis Queue'; };
    this.id = function () { return '7e391df6-6702-4341-9db4-d8af4f6117e6'; };
    this.citiesRepo = new Cities();
};


// All analysis workers are queue workers
util.inherits(AnalysisWorker, QueueWorker);
module.exports = AnalysisWorker;


// Parses the queue item data
AnalysisWorker.prototype.parse = function (data) {
    try {
        var post = JSON.parse(data);
        
        // Perform post-processing to find the exact location for geo data
        if (post.LocationAttributes && (!post.LocationAttributes.State || post.LocationAttributes.State == "")) {
            if (post.Loc && post.Loc.length > 1 && post.Loc[0] != 0 && post.Loc[1] != 0) {
                var self = this;
                this.citiesRepo.findClosestCity(post.Loc, function (err, docs) {
                    if (docs && docs.length > 0) {
                        var place = new Place();
                        place.fromCity(docs[0]);

                        post.Loc = place.Loc;
                        post.LocationAttributes.Country = place.Country;
                        post.LocationAttributes.State = place.State;
                        post.LocationAttributes.StateCode = locationLookup.getStateCode(place.CountryCode, place.StateCode);

                        self.redisClient.rpush('queue:postitems:stats', JSON.stringify(post));
                        return;
                    }
                });
            }
        }

        this.redisClient.rpush('queue:postitems:stats', JSON.stringify(post));
        return;
    }
    catch (err) {
        log('ERROR', err);
    }
};


function main() {
    var worker = new AnalysisWorker();
    worker.run();
};

main();
