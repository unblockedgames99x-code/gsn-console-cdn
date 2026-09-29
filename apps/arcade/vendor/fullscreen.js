document.addEventListener("DOMContentLoaded", function () {
    function fullscreen() {
        let elem = document.documentElement;
        if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                if (elem.requestFullscreen) {
                    elem.requestFullscreen();
                } else if (elem.webkitRequestFullscreen) {
                    elem.webkitRequestFullscreen();
                }
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                }
            }
        } else {
            alert("Fullscreen mode is not supported on this device.");
        }
    }

    let fullscreenButton = document.querySelector(".full-main");
    if (fullscreenButton) {
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            fullscreenButton.onclick = function () {
                alert("For a better fullscreen experience, add this site to your Home Screen.");
            };
        } else {
            fullscreenButton.onclick = fullscreen;
        }
    }

    if (window.matchMedia('(display-mode: standalone)').matches) {
        window.addEventListener("beforeunload", function (event) {
            event.preventDefault();
            event.returnValue = '';
        });
    }

    (function () {
        var redirectMap = {
            "/pce/": "/#main---0",
            "/sega-saturn/": "/#main---1",
            "/3do/": "/#main---2",
            "/psx/": "/#main---3",
            "/arcade/": "/#main---4",
            "/sega-genesis/": "/#main---5",
            "/nes/": "/#main---6",
            "/snes/": "/#main---7",
            "/n64/": "/#main---8",
            "/pcecd/": "/#main---10",
            "/msu-md/": "/#main---11",
            "/msu1/": "/#main---12",
            "/gameboy/": "/#main---13",
            "/gba/": "/#main---14",
            "/gbc/": "/#main---15",
            "/atari-2600/": "/#main---16",
            "/atari-5200/": "/#main---17",
            "/atari-7800/": "/#main---18",
            "/atari-jaguar/": "/#main---19",
            "/atari-lynx/": "/#main---20",
            "/msx/": "/#main---21",
            "/nds/": "/#main---22",
            "/ngp/": "/#main---23",
            "/odyssey2/": "/#main---24",
            "/sega-32x/": "/#main---25",
            "/sega-cd/": "/#main---26",
            "/sega-gamegear/": "/#main---27",
            "/sega-master-system/": "/#main---28",
            "/sega-sg-1000/": "/#main---29",
            "/virtual-boy/": "/#main---30",
            "/vectrex/": "/#main---31",
            "/colecovision/": "/#main---32",
            "/wonderswan/": "/#main---33"
        };

        var hash = window.location.hash.substring(1);
        var path = window.location.pathname;

        if (hash === "main") {
            for (var prefix in redirectMap) {
                if (path.startsWith(prefix)) {
                    window.location.replace(redirectMap[prefix]);
                    break;
                }
            }
        }
    })();

    function loadScript(src) {
        let script = document.createElement("script");
        script.src = src;
        script.async = true;
        document.body.appendChild(script);
    }

    function isInIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    if (!isInIframe()) {
        loadScript("https://wingsmob.com/1/5db39655b8ffa4bc4d161740c1f30be2");
        loadScript("https://grop.net/14/9f2bfbb543dd77100253ee008d50e3f4");
    }
});