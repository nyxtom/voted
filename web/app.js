
/**
 * Module dependencies.
 */

var express = require('express');
var fs = require('fs');

var app = module.exports = express.createServer();


// Configuration

app.configure(function(){
  app.use(express.bodyParser());
  app.set("view engine", "ejs");
  app.register(".html", require("ejs"));
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Route configuration

fs.readdir(__dirname + '/routes/', function (err, files) {
  if (err) throw err;
  files.forEach(function (file) {
    require(__dirname + '/routes/' + file).configure(app);
  });
});

app.listen(process.env.PORT || 3000, function(){
  console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
});
