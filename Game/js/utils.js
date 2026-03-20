(function (APP) {
    "use strict";

    var CFG = APP.CFG;

    function nowMs() {
                return new Date().getTime();
            }

    function trimString(text) {
                if (text === null || text === undefined) {
                    return "";
                }
                return String(text).replace(/^\s+|\s+$/g, "");
            }

    function normalizeName(name) {
                var value = trimString(name);
                value = value.replace(/[\r\n\t]+/g, " ");
                value = value.replace(/\s+/g, " ");
                if (value.length > 24) {
                    value = value.substr(0, 24);
                }
                if (value === "") {
                    value = "Unbekannt";
                }
                return value;
            }

    function setText(el, value) {
                if (el) {
                    el.textContent = value;
                }
            }

    function removeElement(el) {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }

    function clamp(value, minValue, maxValue) {
                if (value < minValue) {
                    return minValue;
                }
                if (value > maxValue) {
                    return maxValue;
                }
                return value;
            }

    function randomRange(minValue, maxValue) {
                return minValue + Math.random() * (maxValue - minValue);
            }

    function signOf(value) {
                if (value > 0) {
                    return 1;
                }
                if (value < 0) {
                    return -1;
                }
                return 0;
            }

    function dampImpulse(value) {
                value = value * CFG.physics.impulseDamping;
                if (Math.abs(value) < CFG.physics.minImpulse) {
                    return 0;
                }
                return value;
            }

    function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
                return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
            }

    function horizontalOverlapAmount(ax, aw, bx, bw) {
                var left = ax > bx ? ax : bx;
                var right = (ax + aw) < (bx + bw) ? (ax + aw) : (bx + bw);
                return right - left;
            }

    function verticalOverlapAmount(ay, ah, by, bh) {
                var top = ay > by ? ay : by;
                var bottom = (ay + ah) < (by + bh) ? (ay + ah) : (by + bh);
                return bottom - top;
            }

    function gapBetweenRanges(a1, a2, b1, b2) {
                if (a2 < b1) {
                    return b1 - a2;
                }
                if (b2 < a1) {
                    return a1 - b2;
                }
                return 0;
            }

    function horizontalGap(ax, aw, bx, bw) {
                return gapBetweenRanges(ax, ax + aw, bx, bx + bw);
            }

    function verticalGap(ay, ah, by, bh) {
                return gapBetweenRanges(ay, ay + ah, by, by + bh);
            }

    function hasSupportOverlapAt(x, w, platformX, platformW) {
                return x + w - CFG.world.overlapInset > platformX && x + CFG.world.overlapInset < platformX + platformW;
            }

    APP.expose("nowMs", nowMs);
    APP.expose("trimString", trimString);
    APP.expose("normalizeName", normalizeName);
    APP.expose("setText", setText);
    APP.expose("removeElement", removeElement);
    APP.expose("clamp", clamp);
    APP.expose("randomRange", randomRange);
    APP.expose("signOf", signOf);
    APP.expose("dampImpulse", dampImpulse);
    APP.expose("rectsOverlap", rectsOverlap);
    APP.expose("horizontalOverlapAmount", horizontalOverlapAmount);
    APP.expose("verticalOverlapAmount", verticalOverlapAmount);
    APP.expose("gapBetweenRanges", gapBetweenRanges);
    APP.expose("horizontalGap", horizontalGap);
    APP.expose("verticalGap", verticalGap);
    APP.expose("hasSupportOverlapAt", hasSupportOverlapAt);
})(window.InfinityRunner);
