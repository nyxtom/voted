api = window.api = {};
api.__namespace = true;

(function ($self, undefined) {

	$self.get = function (onSuccess) {
		amplify.request(
			"api.state-stats",
			{},
			onSuccess
		);
	};

	function configure() {
		amplify.request.define(
			"api.state-stats",
			"ajax", {
				url: "/api/state-stats",
				type: "GET"
			}
		);
	};

	configure();

} (api));
