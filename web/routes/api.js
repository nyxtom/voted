
/**
 * Module dependencies
 */

var config = require('./../../config').values;
var mongo = require('mongojs');
var redis = require('redis');

// Connects to the redis queue
function connectRedis() {
    var redisClient = redis.createClient(config.redis.port, config.redis.host, {});
    return redisClient;
};

exports.configure = function (app) {

  app.get('/api/state-stats', function (req, res) {
      var redisClient = connectRedis();
      redisClient.on('ready', function () {
          redisClient.zrevrange(["voted-states", 0, 200, "WITHSCORES"], function (err, results) {
              res.writeHead(200, {'Content-Type': 'application/json'});
              var stats = {};
              for (var i = 0; i < results.length - 1; i+=2) {
                  stats[results[i]] = parseInt(results[i + 1]);
              }
              res.write(JSON.stringify(stats));
              res.end();
          });
      });
  });

};
