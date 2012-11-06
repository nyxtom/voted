
/**
 * Module dependencies
 */
var mongo = require('mongojs');
var util = require('util');

var log = require('./../lib/log');
var locationLookup = require('./../lib/geonames/locationLookup');
var QueueWorker = require('./../lib/queueWorker');


// Sets up the sentiment worker as a queue worker with name and id
function TwitterQueueWorker() {
    QueueWorker.call(this, 'queue:twitter:parse');
    this.name = function () { return 'Twitter Queue'; };
    this.id = function () { return 'b0671772-b892-4a98-b37d-2bf8e4129f5e'; };
};


// All twitter queue workers are queue workers
util.inherits(TwitterQueueWorker, QueueWorker);
module.exports = TwitterQueueWorker,


// Parses the queue item data
TwitterQueueWorker.prototype.parse = function (data) {
    try {
        var dataObj = JSON.parse(data);
        if (!dataObj || !dataObj.data)
            return;

        // Ensure that we get the data to be parsed
        var obj = dataObj.data;

        // Get the source of the streamed item
        var source = { 
            name: dataObj.sourceName || "Undefined",
            uri: dataObj.sourceUri || ""
        };

        if (obj && obj.user && obj.user.screen_name) {
            var post = {};
            post._id = "tw:" + obj.id_str;
            post.Ident = obj.id_str;
            post.TimeMs = Date.parse(obj.created_at);
            post.HourMs = (post.TimeMs / 3600000) * 3600000;
            post.DayMs = (post.TimeMs / 86400000) * 86400000;
            post.AggregatedMs = new Date().getTime();
            post.Text = obj.text;
            post.SourceName = source.name;
            post.SourceUri = source.uri;
            post.Author = obj.user.screen_name;
            post.ProfileUrl = "https://twitter.com/" + post.Author;
            post.Lang = obj.user.lang;
            post.Network = "Twitter";
            post.UserAttributes = {};
            post.LocationAttributes = {};

            if (obj.user.description)
                post.UserAttributes.Bio = obj.user.description;
            if (obj.user.profile_image_url)
                post.UserAttributes.ProfileImage = obj.user.profile_image_url;
            if (obj.user.name)
                post.UserAttributes.DisplayName = obj.user.name;
            if (obj.user.url)
                post.UserAttributes.Url = obj.user.url;

            // Gather the location so it can be looked up later if needed
            var location = "";
            if (obj.user.location) 
                location = obj.user.location.trim();
            post.UserAttributes.Location = location;

            post.Urls = [];
            if (obj.entities && obj.entities.urls) {
                for (var i = 0; i < obj.entities.urls.length; ++i) {
                    var url = obj.entities.urls[i];
                    post.Text = post.Text.replace(url.url, url.expanded_url);
                    post.Urls.push(url.expanded_url);
                }
            }

            post.Mentions = [];
            if (obj.entities && obj.entities.user_mentions) {
                for (var i = 0; i < obj.entities.user_mentions.length; ++i) {
                    var mention = obj.entities.user_mentions[i];
                    post.Mentions.push(mention.screen_name);
                }
            }

            if (obj.entities && obj.entities.media) {
                for (var i = 0; i < obj.entities.media.length; ++i) {
                    var media = obj.entities.media[i];
                    post.Text = post.Text.replace(media.url, media.media_url);
                    post.Urls.push(media.media_url);
                }
            }

            post.Loc = [0,0];
            var lookupLocation = false;
            if (obj.coordinates || obj.geo || obj.place) {
                if (obj.coordinates && obj.coordinates.coordinates) {
                    var loc = obj.coordinates;
                    post.Loc = [loc.coordinates[0], loc.coordinates[1]];
                }
                else if (obj.geo && obj.geo.coordinates) {
                    var geo = obj.geo;
                    post.Loc = [geo.coordinates[0], geo.coordinates[1]];
                }
                else if (obj.place && obj.place.bounding_box && obj.place.bounding_box.coordinates) {
                    var loc = obj.place.bounding_box.coordinates;
                    var bottomRight = loc[0][0];
                    var topLeft = loc[0][2];
                    post.Loc = [(bottomRight[0] + topLeft[0]) / 2,
                                (bottomRight[1] + topLeft[1]) / 2];
                }
            }
            else if (location != "" && (post.Loc[0] == 0 && post.Loc[1] == 0)) {
                lookupLocation = true;
            }

            post.IsReshare = false;
            if (obj.retweeted_status) {
                post.IsReshare = true;
                post.OriginalIdent = obj.retweeted_status.id_str;
                post.OriginalAuthor = obj.retweeted_status.user.screen_name;
                post.OriginalProfileUrl = "http://twitter.com/" + post.OriginalAuthor;
                post.OriginalTimeMs = Date.parse(obj.retweeted_status.created_at);
                post.OriginalReach = obj.retweeted_status.user.followers_count;
            }

            post.Stats = {};
            post.Stats.Reach = obj.user.followers_count;
            post.Stats.Spread = post.Stats.Reach;
            post.Stats.TopicReach = post.IsReshare ? 0 : post.Stats.Reach;
            post.Stats.TopicSpread = post.IsReshare ? post.Stats.Reach : 0;

            if (lookupLocation) {
                var timezone = obj.user.time_zone;
                var lang = obj.user.lang;
                if (location != "") {
                    var self = this;
                    locationLookup.determineLocation(location, timezone, lang, function (result) {
                        if (result && result.StatusCode == 200 && result.Result) {
                            var place = result.Result;
                            post.Loc = place.Loc;
                            post.LocationAttributes.Country = place.Country;
                            post.LocationAttributes.State = place.State;
                            post.LocationAttributes.StateCode = locationLookup.getStateCode(place.CountryCode, place.StateCode);

                            self.redisClient.rpush('queue:postitems:analysis', JSON.stringify(post));
                            return;
                        }
                    });
                }
            }

            this.redisClient.rpush('queue:postitems:analysis', JSON.stringify(post));
            return;
        }
    }
    catch (err) {
        log('ERROR', err);
    }
};


function main() {
    var worker = new TwitterQueueWorker();
    worker.run();
};

main();
