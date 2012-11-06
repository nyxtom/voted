var twitter = require('ntwitter'),
    redis = require('redis'),
    cp = require('child_process'),
    util = require('util'),
    config = require('./../config.js').values;

var tweets = new twitter({
	consumer_key: config.twitter.consumer_key,
	consumer_secret: config.twitter.consumer_secret,
	access_token_key: config.twitter.access_key,
	access_token_secret: config.twitter.access_secret
});

function ready() {

    tweets.stream('statuses/filter', { track: "#ivoted,#voted" }, function(stream) {
        stream.on('data', tweet);

        // We need to talk about your TPS reports
        // It's just we're putting new coversheets on all the TPS reports before 
        // they go out now. So if you could go ahead and try to remember to do that
        // from now on, that'd be great. All right!
        setTimeout(reportTPS, 1000);
    });

};

var redis_config = config.redis || { 'port': 27017, 'host': 'localhost' };
var cli = redis.createClient();
cli.on('ready', function () {
    ready();
});

var count = 0;
var lastc = 0;

/** Handles incoming tweets **/
function tweet(data) {
    var message = JSON.stringify({
        'sourceName': 'Twitter Filter',
        'sourceUri': 'https://stream.twitter.com/1/statuses/filter.json',
        'data': data
    });
    cli.rpush('queue:twitter:parse', message);
    count++;
}

/** Reports memory usage and tweets per second **/
function reportTPS() {
    var rep = process.memoryUsage();
    rep.tweets = count - lastc;
    lastc = count;
    console.log(JSON.stringify(rep));
    setTimeout(reportTPS, 1000);
}
