(function (window) {
    "use strict";

    var APP = window.InfinityRunner || {};

    APP.version = "0.6.0";
    APP.api = APP.api || {};
    APP.expose = function (name, value) {
        APP.api[name] = value;
        window[name] = value;
        return value;
    };

    window.InfinityRunner = APP;
})(window);
