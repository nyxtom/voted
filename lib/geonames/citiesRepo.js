
var utils = require('./../utils');
var config = require('./../../config').values;

var includedFields = {
    "Name": 1,
    "DisplayName": 1,
    "Country_code": 1,
    "Country": 1,
    "Admin1_code": 1,
    "Admin1": 1,
    "Admin2_code": 1,
    "Admin2": 1,
    "Timezone": 1,
    "Population": 1,
    "Languages": 1,
    "Location": 1
};

function Cities() {
    this.db = utils.getMongoConnection(config.server.GeoNamesConnection, ['cities']);
}

module.exports = Cities;

Cities.prototype.findByName = function (location, callback) {
    this.db.cities.find({"Name":location}, includedFields, callback);
};

Cities.prototype.findClosestCity = function (location, callback) {
    this.db.cities.find({"Location": {"$near": [location[0], location[1]]}}, includedFields, callback);
};
