voted
=====

A real-time heatmap tracking the #voted,#ivoted for election day 2012.

Features
---------
- Uses ntwitter for streaming twitter
- GeoNames to resolve location data in user bios
- GeoNames to find closest cities and states for any geolocated item.
- Pushes all items into a Redis Queue for processing
- Worker queues for parsing, analyzing and incrementing stats
- Stats are incremented by state and author name in a sorted set in Redis.
- D3.js for the Cloropleth Map
- Express.js for the web project to render results

Preview
----------
![](http://i.imgur.com/sJBLW.png)

Project Requirements
--------------------
- Redis.io <http://redis.io/>
- Mongo DB <http://mongodb.org/>

- All packages required to use are in
    npm install .

- To load the geonames database use the following commands
    scripts/geonames/install-libs.pl
    scripts/geonames/import-cities.pl
    scripts/geonames/import-postalcodes.pl
    scripts/geonames/import-states.pl