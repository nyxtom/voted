
/**
 * Module dependencies
 */
var mongo = require('mongojs');
var util = require('util');

var log = require('./../lib/log');
var QueueWorker = require('./../lib/queueWorker');
var config = require('./../config.js').values;


// Sets up the sentiment worker as a queue worker with name and id
function AnalysisWorker() {
    QueueWorker.call(this, 'queue:postitems:stats');
    this.name = function () { return 'Analysis Queue'; };
    this.id = function () { return '7e391df6-6702-4341-9db4-d8af4f6117e6'; };
};


// All sentiment workers are queue workers
util.inherits(AnalysisWorker, QueueWorker);
module.exports = AnalysisWorker;


// Parses the queue item data
AnalysisWorker.prototype.parse = function (data) {
    try {
        var obj = JSON.parse(data);
        if (obj && obj.LocationAttributes.Country || obj.UserAttributes.Location != "") {
            console.log(obj);
        }
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
