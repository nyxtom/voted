
/**
 * Module dependencies
 */
var mongo = require('mongojs');
var util = require('util');
var events = require('events');

var _config = require('./../config').values;


// Worker implementation: 
// includes basic functionality such as reporting, command reactions
function Worker() {
    events.EventEmitter.call(this);
    this.config = {};
    this.running = true;
    this.name = function () { return ''; };
    this.id = function () { return ''; };
    this.workerRepo = null;
    this.reportInterval = null;
    this.startTime = 0;
};

// All workers are event emitters
util.inherits(Worker, events.EventEmitter);
module.exports = Worker;


// Reports the active worker to the database
Worker.prototype.ping = function () {
    var workerInfo = {
        _id: this.id(),
        Name: this.name(),
        Status: this.running ? 'Running': 'Stopped',
        IsStopped: !this.running,
        StartTimeMs: this.startTime,
        StopTimeMs: this.running ? 0 : new Date().getTime(),
        LastPingMs: new Date().getTime()
    };
    try {
        if (!this.workerRepo)
            this.workerRepo = this.getMongoConnection(_config.server.SystemConnection, ['workers']);

        this.workerRepo.workers.save(workerInfo);
    }
    catch (err) {
        log("ERROR", err);
    }
};


// Returns the mongo connection for the given collections
Worker.prototype.getMongoConnection = function (connection, collections) {
    return mongo.connect(connection, collections);
};


// Loads the configuration for the worker from the configs collection
Worker.prototype.loadConfiguration = function () {
    var self = this;
    var db = this.getMongoConnection(_config.server.SystemConnection, ['configs']);
    db.configs.findOne({"_id": this.id()}, function (err, doc) {
        self.bindConfiguration(doc);
    });
};


// Saves the current configuration back to the configs collection
Worker.prototype.saveConfiguration = function () {
    var db = this.getMongoConnection(_config.server.SystemConnection, ['configs']);
    db.configs.save(this.config);
};


// Binds the configuration
Worker.prototype.bindConfiguration = function (config) {
    this.config = config;
    var configured = config && this.validateConfiguration(config);
    
    if (!configured) {
        this.config = {};
        this.config._id = this.id();
        this.config.Name = this.name();
        this.config = this.configure(this.config);
        this.saveConfiguration();
    }

    this.emit('configLoaded');
};


// Runs this instance
Worker.prototype.run = function (configMode) {
    var self = this;
    process.on('SIGINT', function () { self.shutdown(); });
    process.on('SIGTERM', function () { self.shutdown(); });
    this.on('configLoaded', function () {
        if (!configMode) {
            this.startTime = new Date().getTime();
            this.ping();
            this.workerReport();
            this.execute();
            if (_config.verbose) {
                console.log(this.id() + "/" + this.name() + " running");
            }
        }
    });

    this.loadConfiguration();
};


// Clean shutdown method
Worker.prototype.shutdown = function () {
    this.running = false;
    clearInterval(this.reportInterval);
    this.ping();
    process.exit();
};


// Working reporting loop
Worker.prototype.workerReport = function () {
    var self = this;
    this.reportInterval = setInterval(function () { self.ping(); }, 60000);
    this.ping();
};


Worker.prototype.configure = function (config) { return config; };
Worker.prototype.validateConfiguration = function (config) { return true; };
Worker.prototype.execute = function () { };
