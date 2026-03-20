(function (APP) {
    "use strict";

    var state = APP.state;
    var dom = APP.dom;

    function shouldUseAdaptiveMobileScale() {
        var isTouchDevice = window.isTouchPrimaryDevice ? isTouchPrimaryDevice() : (("ontouchstart" in window) || (navigator.maxTouchPoints > 0));
        return isTouchDevice && (window.innerWidth <= 1100 || window.innerHeight <= 900);
    }

    function updateResponsiveScale() {
        var width = window.innerWidth || document.body.clientWidth || 1280;
        var height = window.innerHeight || document.body.clientHeight || 720;
        var scale;
        var offsetX;
        var offsetY;

        if (!state.display) {
            state.display = {
                active: false,
                scale: 1,
                baseWidth: 1600,
                baseHeight: 900,
                virtualWidth: width,
                virtualHeight: height
            };
        }

        if (!dom.appRoot) {
            state.display.active = false;
            state.display.scale = 1;
            state.display.virtualWidth = width;
            state.display.virtualHeight = height;
            return;
        }

        if (shouldUseAdaptiveMobileScale()) {
            scale = Math.min(width / state.display.baseWidth, height / state.display.baseHeight);
            if (!isFinite(scale) || scale <= 0) {
                scale = 1;
            }
            offsetX = Math.floor((width - state.display.baseWidth * scale) / 2);
            offsetY = Math.floor((height - state.display.baseHeight * scale) / 2);
            state.display.active = true;
            state.display.scale = scale;
            state.display.virtualWidth = state.display.baseWidth;
            state.display.virtualHeight = state.display.baseHeight;
            dom.appRoot.style.width = state.display.baseWidth + "px";
            dom.appRoot.style.height = state.display.baseHeight + "px";
            dom.appRoot.style.left = offsetX + "px";
            dom.appRoot.style.top = offsetY + "px";
            dom.appRoot.style.transform = "scale(" + scale + ")";
        } else {
            state.display.active = false;
            state.display.scale = 1;
            state.display.virtualWidth = width;
            state.display.virtualHeight = height;
            dom.appRoot.style.width = "100%";
            dom.appRoot.style.height = "100%";
            dom.appRoot.style.left = "0";
            dom.appRoot.style.top = "0";
            dom.appRoot.style.transform = "none";
        }
    }

    function handleWindowBlur() {
        if (window.resetInputs) {
            resetInputs();
        }
        if (window.releaseAllTouchInputs) {
            releaseAllTouchInputs();
        }
    }

    function init() {
        loadHighscore();
        buildDom();
        updateResponsiveScale();
        if (window.initTouchControls) {
            initTouchControls();
        }
        if (window.initOnlineUi) {
            initOnlineUi();
        }
        updateHighscoreHud();
        window.addEventListener("keydown", handleKeyDown, { passive: false });
        window.addEventListener("keyup", handleKeyUp, { passive: false });
        window.addEventListener("resize", updateResponsiveScale);
        window.addEventListener("orientationchange", updateResponsiveScale);
        window.addEventListener("blur", handleWindowBlur);
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                handleWindowBlur();
            }
        });
    }

    APP.expose("updateResponsiveScale", updateResponsiveScale);
    APP.expose("init", init);
    window.addEventListener("DOMContentLoaded", init);
})(window.InfinityRunner);
