
/**
 * Module dependencies
 */
var mongojs = require('mongojs');
var redis = require('redis');
var util = require('util');
var S = require('string');

// Models in geonames
var Place = require('./place');
var utils = require('./../utils');

exports.getStateCode = function (countryCode, stateCode) {
    if (CountriesWithStates.indexOf(countryCode) >= 0)
        return countryCode + "-" + stateCode;
    else
        return countryCode;
};

exports.determineLocation = function (citiesRepo, location, timezone, language, locationCallback) {
    /// <summary>Determines the location from a string bio location/timezone and language preference if there.</summary>

    var place = new Place();

    // force the location to lower case for simpler name matching
    location = location.toLowerCase();

    if (!timezone)
        timezone = "";

    // replace timezone names ued in Twitter with IANA style
    if (timeZoneLookup[timezone])
        timezone = timeZoneLookup[timezone];

    // swap any US states which have commas in their name with the state code
    for (var commaState in usStatesWithCommas) {
        location = location.replace(commaState, usStatesWithCommas[commaState]);
    }

    // split on , e.g. New York, New York
    var locTokens = location.split(',');
    for (var i = 0; i < locTokens.length; i++) {
        locTokens[i] = locTokens[i].trim();
    }

    // if we're in a US timezone, or timezone is not set, swap any state names for the codes again
    var inUS = false;
    if (timezone == "" || usTimezones.indexOf(timezone) >= 0) {
        inUS = true;
        for (var i = 0; i < locTokens.length; i++) {
            if (usStates[locTokens[i]]) {
                locTokens[i] = usStates[locTokens[i]];
            }
        }
    }

    if (locTokens.length == 2 && locTokens[1].length == 2) {
        locTokens[1] = locTokens[1].toUpperCase();
    }
    
    // get any cities which match the first part of the location
    citiesRepo.findByName(locTokens[0], function (err, docs) {

        // didn't find any
        if (!docs || docs.length == 0) {
            locationCallback({ StatusCode: 500, Message: 'not found', Result: null });
            return;
        }

        // found exactly one
        if (docs.length == 1) {
            var doc = docs[0];
            var place = new Place();
            place.fromCity(doc);
            locationCallback({ StatusCode: 200, Message: 'OK', Result: place});
            return;
        }

        // found more than one city, see which one is most likely, by filtering on timezone, language and ordering by population

        var results = docs;
        if (timezone != "") {
            results = docs.filter(function (doc) {
                return doc.Timezone == timezone;
            });
        }

        // filter on state
        if (locTokens.length > 1 && locTokens[1].length == 2 && inUS) {
            results = results.filter(function (result) {
                return result.Admin1_code == locTokens[1];
            });
        }
        else if (locTokens.length == 2 && locTokens[1].length == 2) {
            var citiesFiltered = results.filter(function (result) {
                return result.Admin1_code == locTokens[1];
            });

            if (citiesFiltered.length > 0)
                results = citiesFiltered;
        }

        // filter on language? TODO
        
        // oops, filtered too much!
        if (results.length == 0) {
            locationCallback({ StatusCode: 500, Message: 'not found', Result: null });
            return;
        }

        // finally take the first one (biggest population)
        results = results.sort(function (a, b) {
            return b.Population - a.Population;
        });

        var place = new Place();
        place.fromCity(results[0]);
        locationCallback({ StatusCode: 200, Message: 'OK', Result: place});
        return;
    });
    return;
};

var CountriesWithStates = [ "GB", "US" ];

var usStatesWithCommas = 
{
    "washington, d.c.": "DC",
    "washington, dc": "DC"
};

var usStates = 
{
    "arkansas": "AR",
    "washington d.c.": "DC",
    "washington dc": "DC",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "kansas": "KS",
    "louisiana": "LA",
    "maryland": "MD",
    "missouri": "MO",
    "mississippi": "MS",
    "north carolina": "NC",
    "n carolina": "NC",
    "oklahoma": "OK",
    "south carolina": "SC",
    "s carolina": "SC",
    "tennessee": "TN",
    "texas": "TX",
    "west virginia": "WV",
    "w virginia": "WV",
    "alabama": "AL",
    "connecticut": "CT",
    "iowa": "IA",
    "illinois": "IL",
    "indiana": "IN",
    "maine": "ME",
    "michigan": "MI",
    "minnesota": "MN",
    "nebraska": "NE",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new york": "NY",
    "ohio": "OH",
    "rhode island": "RI",
    "vermont": "VT",
    "wisconsin": "WI",
    "california": "CA",
    "colorado": "CO",
    "new mexico": "NM",
    "nevada": "NV",
    "utah": "UT",
    "arizona": "AZ",
    "idaho": "ID",
    "montana": "MT",
    "north dakota": "ND",
    "n dakota": "ND",
    "oregon": "OR",
    "south dakota": "SD",
    "s dakota": "SD",
    "washington": "WA",
    "wyoming": "WY",
    "hawaii": "HI",
    "alaska": "AK",
    "kentucky": "KY",
    "massachusetts": "MA",
    "pennsylvania": "PA",
    "virginia": "VA"
};

var timeZoneLookup = 
{
    "International Date Line West": "Pacific/Midway" ,
    "Midway Island": "Pacific/Midway" ,
    "American Samoa": "Pacific/Pago_Pago" ,
    "Hawaii": "Pacific/Honolulu" ,
    "Alaska": "America/Juneau" ,
    "Pacific Time (US & Canada)": "America/Los_Angeles" ,
    "Tijuana": "America/Tijuana" ,
    "Mountain Time (US & Canada)": "America/Denver" ,
    "Arizona": "America/Phoenix" ,
    "Chihuahua": "America/Chihuahua" ,
    "Mazatlan": "America/Mazatlan" ,
    "Central Time (US & Canada)": "America/Chicago" ,
    "Saskatchewan": "America/Regina" ,
    "Guadalajara": "America/Mexico_City" ,
    "Mexico City": "America/Mexico_City" ,
    "Monterrey": "America/Monterrey" ,
    "Central America": "America/Guatemala" ,
    "Eastern Time (US & Canada)": "America/New_York" ,
    "Indiana (East)": "America/Indiana/Indianapolis" ,
    "Bogota": "America/Bogota" ,
    "Lima": "America/Lima" ,
    "Quito": "America/Lima" ,
    "Atlantic Time (Canada)": "America/Halifax" ,
    "Caracas": "America/Caracas" ,
    "La Paz": "America/La_Paz" ,
    "Santiago": "America/Santiago" ,
    "Newfoundland": "America/St_Johns" ,
    "Brasilia": "America/Sao_Paulo" ,
    "Buenos Aires": "America/Argentina/Buenos_Aires" ,
    "Georgetown": "America/Guyana" ,
    "Greenland": "America/Godthab" ,
    "Mid-Atlantic": "Atlantic/South_Georgia" ,
    "Azores": "Atlantic/Azores" ,
    "Cape Verde Is.": "Atlantic/Cape_Verde" ,
    "Dublin": "Europe/Dublin" ,
    "Edinburgh": "Europe/London" ,
    "Lisbon": "Europe/Lisbon" ,
    "London": "Europe/London" ,
    "Casablanca": "Africa/Casablanca" ,
    "Monrovia": "Africa/Monrovia" ,
    "UTC": "Etc/UTC" ,
    "Belgrade": "Europe/Belgrade" ,
    "Bratislava": "Europe/Bratislava" ,
    "Budapest": "Europe/Budapest" ,
    "Ljubljana": "Europe/Ljubljana" ,
    "Prague": "Europe/Prague" ,
    "Sarajevo": "Europe/Sarajevo" ,
    "Skopje": "Europe/Skopje" ,
    "Warsaw": "Europe/Warsaw" ,
    "Zagreb": "Europe/Zagreb" ,
    "Brussels": "Europe/Brussels" ,
    "Copenhagen": "Europe/Copenhagen" ,
    "Madrid": "Europe/Madrid" ,
    "Paris": "Europe/Paris" ,
    "Amsterdam": "Europe/Amsterdam" ,
    "Berlin": "Europe/Berlin" ,
    "Bern": "Europe/Berlin" ,
    "Rome": "Europe/Rome" ,
    "Stockholm": "Europe/Stockholm" ,
    "Vienna": "Europe/Vienna" ,
    "West Central Africa": "Africa/Algiers" ,
    "Bucharest": "Europe/Bucharest" ,
    "Cairo": "Africa/Cairo" ,
    "Helsinki": "Europe/Helsinki" ,
    "Kyiv": "Europe/Kiev" ,
    "Riga": "Europe/Riga" ,
    "Sofia": "Europe/Sofia" ,
    "Tallinn": "Europe/Tallinn" ,
    "Vilnius": "Europe/Vilnius" ,
    "Athens": "Europe/Athens" ,
    "Istanbul": "Europe/Istanbul" ,
    "Minsk": "Europe/Minsk" ,
    "Jerusalem": "Asia/Jerusalem" ,
    "Harare": "Africa/Harare" ,
    "Pretoria": "Africa/Johannesburg" ,
    "Moscow": "Europe/Moscow" ,
    "St. Petersburg": "Europe/Moscow" ,
    "Volgograd": "Europe/Moscow" ,
    "Kuwait": "Asia/Kuwait" ,
    "Riyadh": "Asia/Riyadh" ,
    "Nairobi": "Africa/Nairobi" ,
    "Baghdad": "Asia/Baghdad" ,
    "Tehran": "Asia/Tehran" ,
    "Abu Dhabi": "Asia/Muscat" ,
    "Muscat": "Asia/Muscat" ,
    "Baku": "Asia/Baku" ,
    "Tbilisi": "Asia/Tbilisi" ,
    "Yerevan": "Asia/Yerevan" ,
    "Kabul": "Asia/Kabul" ,
    "Ekaterinburg": "Asia/Yekaterinburg" ,
    "Islamabad": "Asia/Karachi" ,
    "Karachi": "Asia/Karachi" ,
    "Tashkent": "Asia/Tashkent" ,
    "Chennai": "Asia/Kolkata" ,
    "Kolkata": "Asia/Kolkata" ,
    "Mumbai": "Asia/Kolkata" ,
    "New Delhi": "Asia/Kolkata" ,
    "Kathmandu": "Asia/Kathmandu" ,
    "Astana": "Asia/Dhaka" ,
    "Dhaka": "Asia/Dhaka" ,
    "Sri Jayawardenepura": "Asia/Colombo" ,
    "Almaty": "Asia/Almaty" ,
    "Novosibirsk": "Asia/Novosibirsk" ,
    "Rangoon": "Asia/Rangoon" ,
    "Bangkok": "Asia/Bangkok" ,
    "Hanoi": "Asia/Bangkok" ,
    "Jakarta": "Asia/Jakarta" ,
    "Krasnoyarsk": "Asia/Krasnoyarsk" ,
    "Beijing": "Asia/Shanghai" ,
    "Chongqing": "Asia/Chongqing" ,
    "Hong Kong": "Asia/Hong_Kong" ,
    "Urumqi": "Asia/Urumqi" ,
    "Kuala Lumpur": "Asia/Kuala_Lumpur" ,
    "Singapore": "Asia/Singapore" ,
    "Taipei": "Asia/Taipei" ,
    "Perth": "Australia/Perth" ,
    "Irkutsk": "Asia/Irkutsk" ,
    "Ulaan Bataar": "Asia/Ulaanbaatar" ,
    "Seoul": "Asia/Seoul" ,
    "Osaka": "Asia/Tokyo" ,
    "Sapporo": "Asia/Tokyo" ,
    "Tokyo": "Asia/Tokyo" ,
    "Yakutsk": "Asia/Yakutsk" ,
    "Darwin": "Australia/Darwin" ,
    "Adelaide": "Australia/Adelaide" ,
    "Canberra": "Australia/Melbourne" ,
    "Melbourne": "Australia/Melbourne" ,
    "Sydney": "Australia/Sydney" ,
    "Brisbane": "Australia/Brisbane" ,
    "Hobart": "Australia/Hobart" ,
    "Vladivostok": "Asia/Vladivostok" ,
    "Guam": "Pacific/Guam" ,
    "Port Moresby": "Pacific/Port_Moresby" ,
    "Magadan": "Asia/Magadan" ,
    "Solomon Is.": "Asia/Magadan" ,
    "New Caledonia": "Pacific/Noumea" ,
    "Fiji": "Pacific/Fiji" ,
    "Kamchatka": "Asia/Kamchatka" ,
    "Marshall Is.": "Pacific/Majuro" ,
    "Auckland": "Pacific/Auckland" ,
    "Wellington": "Pacific/Auckland" ,
    "Nuku'alofa": "Pacific/Tongatapu" ,
    "Tokelau Is.": "Pacific/Fakaofo" ,
    "Samoa": "Pacific/Apia"
};

var usTimezones = [
    "Pacific/Honolulu",
    "America/Juneau",
    "America/Phoenix",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Indiana/Indianapolis"
];

var countryLookup =  {
    "ANDORRA": "AD" ,
    "UNITED ARAB EMIRATES": "AE" ,
    "AFGHANISTAN": "AF" ,
    "ANTIGUA AND BARBUDA": "AG" ,
    "ANGUILLA": "AI" ,
    "ALBANIA": "AL" ,
    "ARMENIA": "AM" ,
    "ANGOLA": "AO" ,
    "ANTARCTICA": "AQ" ,
    "ARGENTINA": "AR" ,
    "AMERICAN SAMOA": "AS" ,
    "AUSTRIA": "AT" ,
    "AUSTRALIA": "AU" ,
    "ARUBA": "AW" ,
    "ALAND ISLANDS": "AX" ,
    "AZERBAIJAN": "AZ" ,
    "BOSNIA AND HERZEGOVINA": "BA" ,
    "BARBADOS": "BB" ,
    "BANGLADESH": "BD" ,
    "BELGIUM": "BE" ,
    "BURKINA FASO": "BF" ,
    "BULGARIA": "BG" ,
    "BAHRAIN": "BH" ,
    "BURUNDI": "BI" ,
    "BENIN": "BJ" ,
    "SAINT BARTHELEMY": "BL" ,
    "BERMUDA": "BM" ,
    "BRUNEI": "BN" ,
    "BOLIVIA": "BO" ,
    "SAINT EUSTATIUS AND SABA": "BQ" ,
    "BONAIRE": "BQ" ,
    "BRAZIL": "BR" ,
    "BAHAMAS": "BS" ,
    "BHUTAN": "BT" ,
    "BOUVET ISLAND": "BV" ,
    "BOTSWANA": "BW" ,
    "BELARUS": "BY" ,
    "BELIZE": "BZ" ,
    "CANADA": "CA" ,
    "COCOS ISLANDS": "CC" ,
    "DEMOCRATIC REPUBLIC OF THE CONGO": "CD" ,
    "CENTRAL AFRICAN REPUBLIC": "CF" ,
    "REPUBLIC OF THE CONGO": "CG" ,
    "SWITZERLAND": "CH" ,
    "IVORY COAST": "CI" ,
    "COOK ISLANDS": "CK" ,
    "CHILE": "CL" ,
    "CAMEROON": "CM" ,
    "CHINA": "CN" ,
    "COLOMBIA": "CO" ,
    "COSTA RICA": "CR" ,
    "CUBA": "CU" ,
    "CAPE VERDE": "CV" ,
    "CURACAO": "CW" ,
    "CHRISTMAS ISLAND": "CX" ,
    "CYPRUS": "CY" ,
    "CZECH REPUBLIC": "CZ" ,
    "GERMANY": "DE" ,
    "DJIBOUTI": "DJ" ,
    "DENMARK": "DK" ,
    "DOMINICA": "DM" ,
    "DOMINICAN REPUBLIC": "DO" ,
    "ALGERIA": "DZ" ,
    "ECUADOR": "EC" ,
    "ESTONIA": "EE" ,
    "EGYPT": "EG" ,
    "WESTERN SAHARA": "EH" ,
    "ERITREA": "ER" ,
    "SPAIN": "ES" ,
    "ETHIOPIA": "ET" ,
    "FINLAND": "FI" ,
    "FIJI": "FJ" ,
    "FALKLAND ISLANDS": "FK" ,
    "MICRONESIA": "FM" ,
    "FAROE ISLANDS": "FO" ,
    "FRANCE": "FR" ,
    "GABON": "GA" ,
    "GREAT BRITAIN": "GB" ,
    "GB": "GB" ,
    "UNITED KINGDOM": "GB" ,
    "UK": "GB" ,
    "GRENADA": "GD" ,
    "GEORGIA": "GE" ,
    "FRENCH GUIANA": "GF" ,
    "GUERNSEY": "GG" ,
    "GHANA": "GH" ,
    "GIBRALTAR": "GI" ,
    "GREENLAND": "GL" ,
    "GAMBIA": "GM" ,
    "GUINEA": "GN" ,
    "GUADELOUPE": "GP" ,
    "EQUATORIAL GUINEA": "GQ" ,
    "GREECE": "GR" ,
    "SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS": "GS" ,
    "GUATEMALA": "GT" ,
    "GUAM": "GU" ,
    "GUINEA-BISSAU": "GW" ,
    "GUYANA": "GY" ,
    "HONG KONG": "HK" ,
    "HEARD ISLAND AND MCDONALD ISLANDS": "HM" ,
    "HONDURAS": "HN" ,
    "CROATIA": "HR" ,
    "HAITI": "HT" ,
    "HUNGARY": "HU" ,
    "INDONESIA": "ID" ,
    "IRELAND": "IE" ,
    "ISRAEL": "IL" ,
    "ISLE OF MAN": "IM" ,
    "INDIA": "IN" ,
    "BRITISH INDIAN OCEAN TERRITORY": "IO" ,
    "IRAQ": "IQ" ,
    "IRAN": "IR" ,
    "ICELAND": "IS" ,
    "ITALY": "IT" ,
    "JERSEY": "JE" ,
    "JAMAICA": "JM" ,
    "JORDAN": "JO" ,
    "JAPAN": "JP" ,
    "KENYA": "KE" ,
    "KYRGYZSTAN": "KG" ,
    "CAMBODIA": "KH" ,
    "KIRIBATI": "KI" ,
    "COMOROS": "KM" ,
    "SAINT KITTS AND NEVIS": "KN" ,
    "NORTH KOREA": "KP" ,
    "SOUTH KOREA": "KR" ,
    "KOSOVO": "XK" ,
    "KUWAIT": "KW" ,
    "CAYMAN ISLANDS": "KY" ,
    "KAZAKHSTAN": "KZ" ,
    "LAOS": "LA" ,
    "LEBANON": "LB" ,
    "SAINT LUCIA": "LC" ,
    "LIECHTENSTEIN": "LI" ,
    "SRI LANKA": "LK" ,
    "LIBERIA": "LR" ,
    "LESOTHO": "LS" ,
    "LITHUANIA": "LT" ,
    "LUXEMBOURG": "LU" ,
    "LATVIA": "LV" ,
    "LIBYA": "LY" ,
    "MOROCCO": "MA" ,
    "MONACO": "MC" ,
    "MOLDOVA": "MD" ,
    "MONTENEGRO": "ME" ,
    "SAINT MARTIN": "MF" ,
    "MADAGASCAR": "MG" ,
    "MARSHALL ISLANDS": "MH" ,
    "MACEDONIA": "MK" ,
    "MALI": "ML" ,
    "MYANMAR": "MM" ,
    "MONGOLIA": "MN" ,
    "MACAO": "MO" ,
    "NORTHERN MARIANA ISLANDS": "MP" ,
    "MARTINIQUE": "MQ" ,
    "MAURITANIA": "MR" ,
    "MONTSERRAT": "MS" ,
    "MALTA": "MT" ,
    "MAURITIUS": "MU" ,
    "MALDIVES": "MV" ,
    "MALAWI": "MW" ,
    "MEXICO": "MX" ,
    "MALAYSIA": "MY" ,
    "MOZAMBIQUE": "MZ" ,
    "NAMIBIA": "NA" ,
    "NEW CALEDONIA": "NC" ,
    "NIGER": "NE" ,
    "NORFOLK ISLAND": "NF" ,
    "NIGERIA": "NG" ,
    "NICARAGUA": "NI" ,
    "NETHERLANDS": "NL" ,
    "NORWAY": "NO" ,
    "NEPAL": "NP" ,
    "NAURU": "NR" ,
    "NIUE": "NU" ,
    "NEW ZEALAND": "NZ" ,
    "OMAN": "OM" ,
    "PANAMA": "PA" ,
    "PERU": "PE" ,
    "FRENCH POLYNESIA": "PF" ,
    "PAPUA NEW GUINEA": "PG" ,
    "PHILIPPINES": "PH" ,
    "PAKISTAN": "PK" ,
    "POLAND": "PL" ,
    "SAINT PIERRE AND MIQUELON": "PM" ,
    "PITCAIRN": "PN" ,
    "PUERTO RICO": "PR" ,
    "PALESTINIAN TERRITORY": "PS" ,
    "PORTUGAL": "PT" ,
    "PALAU": "PW" ,
    "PARAGUAY": "PY" ,
    "QATAR": "QA" ,
    "REUNION": "RE" ,
    "ROMANIA": "RO" ,
    "SERBIA": "RS" ,
    "RUSSIA": "RU" ,
    "RWANDA": "RW" ,
    "SAUDI ARABIA": "SA" ,
    "SOLOMON ISLANDS": "SB" ,
    "SEYCHELLES": "SC" ,
    "SUDAN": "SD" ,
    "SOUTH SUDAN": "SS" ,
    "SWEDEN": "SE" ,
    "SINGAPORE": "SG" ,
    "SAINT HELENA": "SH" ,
    "SLOVENIA": "SI" ,
    "SVALBARD AND JAN MAYEN": "SJ" ,
    "SLOVAKIA": "SK" ,
    "SIERRA LEONE": "SL" ,
    "SAN MARINO": "SM" ,
    "SENEGAL": "SN" ,
    "SOMALIA": "SO" ,
    "SURINAME": "SR" ,
    "SAO TOME AND PRINCIPE": "ST" ,
    "EL SALVADOR": "SV" ,
    "SINT MAARTEN": "SX" ,
    "SYRIA": "SY" ,
    "SWAZILAND": "SZ" ,
    "TURKS AND CAICOS ISLANDS": "TC" ,
    "CHAD": "TD" ,
    "FRENCH SOUTHERN TERRITORIES": "TF" ,
    "TOGO": "TG" ,
    "THAILAND": "TH" ,
    "TAJIKISTAN": "TJ" ,
    "TOKELAU": "TK" ,
    "EAST TIMOR": "TL" ,
    "TURKMENISTAN": "TM" ,
    "TUNISIA": "TN" ,
    "TONGA": "TO" ,
    "TURKEY": "TR" ,
    "TRINIDAD AND TOBAGO": "TT" ,
    "TUVALU": "TV" ,
    "TAIWAN": "TW" ,
    "TANZANIA": "TZ" ,
    "UKRAINE": "UA" ,
    "UGANDA": "UG" ,
    "UNITED STATES MINOR OUTLYING ISLANDS": "UM" ,
    "UNITED STATES": "US" ,
    "UNITED STATES OF AMERICA": "US" ,
    "US": "US" ,
    "USA": "US" ,
    "U.S.A.": "US" ,
    "URUGUAY": "UY" ,
    "UZBEKISTAN": "UZ" ,
    "VATICAN": "VA" ,
    "SAINT VINCENT AND THE GRENADINES": "VC" ,
    "VENEZUELA": "VE" ,
    "BRITISH VIRGIN ISLANDS": "VG" ,
    "U.S. VIRGIN ISLANDS": "VI" ,
    "VIETNAM": "VN" ,
    "VANUATU": "VU" ,
    "WALLIS AND FUTUNA": "WF" ,
    "SAMOA": "WS" ,
    "YEMEN": "YE" ,
    "MAYOTTE": "YT" ,
    "SOUTH AFRICA": "ZA" ,
    "ZAMBIA": "ZM" ,
    "ZIMBABWE": "ZW" ,
    "SERBIA AND MONTENEGRO": "CS" ,
    "NETHERLANDS ANTILLES": "AN"
};
