voted = window.voted || {};
voted.__namespace = true;

voted.controls = voted.controls || {};
voted.controls.__namespace = true;

voted.controls.map = voted.controls.map || {};
voted.controls.map.__namespace = true;

(function ($self, undefined) {

    var vars = {
        geoStatesUrl: "/scripts/util/lib/states-codes.json"
    };

    $self.SummizedMapData = function (data, countryCode) {
        var self = this;
        self.mapData = {};
        self.min = 1000;
        self.max = 0;
        for (var key in data) {
            if (!countryCode || 
                (countryCode && key.indexOf(countryCode) == 0)) {
                self.mapData[key] = data[key];
            }
        }
    };
    $self.SummizedMapData.__class = true;

    $self.CloroplethMap = function (container, data, options) {
        /// <summary>Represents a map used for diagraming cloropleths.</summary>

        var self = this;
        self.container = container;
        self.selectedContainer = $(container);
        self.dimensions = { h: self.selectedContainer.height(), w: self.selectedContainer.width() };
        self.options = options || { bg: "#eee" };
        self.countryCode = "US";

        self.update = function (newData) {
            self.rawData = newData;
            self.data = new $self.SummizedMapData(self.rawData, self.countryCode);
            self.quantize = d3.scale.quantile().domain([self.data.min, self.data.max]).range(d3.range(9));
            self.init();
        };

        self.init = function () {
            self.path = d3.geo.path()
                         .projection(d3.geo.albersUsa().scale(self.dimensions.w * 1.15).translate([(self.dimensions.w / 2),self.dimensions.h / 2]));

            self.svg = d3.select(self.container).append("svg:svg")
                         .attr("class", "Blues")
                         .attr("width", self.dimensions.w)
                         .attr("height", self.dimensions.h);

            self.svg.append("svg:rect")
                    .attr("fill", self.options.bg)
                    .attr("width", self.dimensions.w)
                    .attr("height", self.dimensions.h);

            self.states = self.svg.append("svg:g")
                              .attr("id", "states");

            d3.json(vars.geoStatesUrl, function(json) {
              self.states.selectAll("path")
                  .data(json.features)
                .enter().append("svg:path")
                  .attr("class", function (d) { 
                      var mentions = self.data.mapData[d.id] ? self.data.mapData[d.id] : 0;
                      return "q" + self.quantize(mentions) + "-9"; 
                  })
                  .attr("d", self.path);
            });
        };

        if (data.length > 0) {
            self.update(data);
        }

    };
    $self.CloroplethMap.__class = true;

} (voted.controls.map));
