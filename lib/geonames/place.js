
var utils = require('./../utils');

var admin2Countries = [ "United Kingdom" ];

function Place() {
    this.Country = "";
    this.CountryCode =  "";
    this.State = "";
    this.StateCode = "";
    this.City = "";
    this.Loc = [0,0];
}

Place.prototype.fromCity = function (city) {
    if (city.DisplayName == "") {
        this.City = utils.initialCapitals(city.Name);
    }
    else {
        this.City = city.DisplayName;
    }

    this.Loc = city.Location;
    this.Country = city.Country;
    this.CountryCode = city.Country_code;
    
    if (admin2Countries.indexOf(city.Country) >= 0) {
        this.State = city.Admin2;
        this.StateCode = city.Admin2_code;
    }
    else {
        this.State = city.Admin1;
        this.StateCode = city.Admin1_code;
    }
};

Place.prototype.fromPostalCode = function (postalCode) {
    this.City = postalCode.Place_Name;
    this.Loc = postalCode.Location;
    this.Country = postalCode.Country;
    this.CountryCode = postalCode.Country_Code;
    
    if (admin2Countries.indexOf(postalCode.Country) >= 0) {
        this.State = postalCode.Admin2_Name2;
        this.StateCode = postalCode.Admin2_Code2;
    }
    else {
        this.State = postalCode.Admin1_Name1;
        this.StateCode = postalCode.Admin1_Code1;
    }
};

module.exports = Place;
