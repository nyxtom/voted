
var S = require('string');
var mongo = require('mongojs');

exports.initialCapitals = function (text) {
    var words = text.split(' ');
    for (var i = 0; i < words.length; i++) {
        var word = words[i];
        words[i] = S(word).capitalize().s;
    }
    return words.join(' ');
};

exports.getMongoConnection = function (connection, collections) {
    return mongo.connect(connection, collections);
};
