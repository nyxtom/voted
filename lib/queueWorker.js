
/**
 * Module dependencies
 */
var mongojs = require('mongojs');
var redis = require('redis');
var util = require('util');

var config = require('./../config').values;
var log = require('./log');
var Worker = require('./worker');


// Setup the queue worker implementation
function QueueWorker(queueName) {
    Worker.call(this);
    this.queueName = queueName;
};


// All queue workers are workers
util.inherits(QueueWorker, Worker);
module.exports = QueueWorker;


// Connects to the redis queue
QueueWorker.prototype.connectRedis = function () {
    var self = this;
    this.redisClient = redis.createClient(config.redis.port, config.redis.host, {});
    this.redisClient.on('error', function (err) {
        log('ERROR', err);
    });
    this.redisClient.on('ready', function () {
        self.emit('ready');
    });
    this.count = 0;
};


// Loads the blocking pop queue operation from redis
QueueWorker.prototype.loadFromQueue = function () {
    var self = this;
    if (!this.running) return;

    this.redisClient.blpop(this.queueName, 0, function (err, doc) {
        if (err) {
            log('ERROR', err);
        }
        else if (doc && doc.length > 1) {
            self.parse(doc[1]);
            self.count++;
        }

        self.loadFromQueue();
    });
};


// Executes the main functionality of the queue
QueueWorker.prototype._execute = QueueWorker.prototype.execute;
QueueWorker.prototype.execute = function () {
    var self = this;
    this.on('ready', function () {
        self.report();
        self.loadFromQueue();
    });
    this.connectRedis();
    this._execute();
};


// Reports on the number of items processed per second
QueueWorker.prototype.report = function () {
    var rep = process.memoryUsage();
    rep.processed = this.count;
    this.count = 0;
    var self = this;
    console.log(JSON.stringify(rep));
    setTimeout(function () { self.report(); }, 1000);
}


// Shutdown event, calls base cleanup method
QueueWorker.prototype._shutdown = QueueWorker.prototype.shutdown;
QueueWorker.prototype.shutdown = function () {
    this.redisClient.quit();
    this._shutdown();
};


// Parses the given message as a blocking pop
QueueWorker.prototype.parse = function (queueItem) {
};
