
voted = window.voted || {};

(function ($self, undefined) {

    function init() {
        this.mapContainer = $("#mapContainer");
        var self = this;
        this.mapControl = new voted.controls.map.CloroplethMap("#mapContainer", [], {});
        api.get(function (stats) {
            self.mapControl.update(stats);
        });
    }

    init();

}(voted));
