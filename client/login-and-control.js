// defaults for your connection
const DEFAULT_USERNAME = "<TURN username>"
const DEFAULT_CREDENTIAL = "<TURN credential>"
const DEFAULT_SERVER = "<server / ip address>"
const DEFAULT_PORT = 13370
const STUN_SERVER = "stun:<domain name>:5349"
const TURN_SERVER = "turn:<domain name>:5349"

// set defaults for entries
document.getElementById("username").value = DEFAULT_USERNAME;
document.getElementById("credential").value = DEFAULT_CREDENTIAL;
document.getElementById("server").value = DEFAULT_SERVER;
document.getElementById("port").value = DEFAULT_PORT;

// Attach it to the window so it can be inspected at the console.
window.gamepad = new Gamepad();
let mode = "login"

if (!gamepad.init()) {
    alert('Your browser does not support gamepads, get the latest Google Chrome or Firefox.');
}

// upon clicking "connect", this executes.
function initializeWebRTCAndController() {
    let throttle = 64; // ms between input sends
    let next_scan = Date.now() + throttle;

    const username = document.getElementById("username").value;
    const credential = document.getElementById("credential").value;
    const serverIP = document.getElementById("server").value;
    const wsPort = document.getElementById("port").value;
    let socket = null;

    let currentController = null;
    document.getElementById("content").innerHTML = '<h1 id="title" class="h3 mb-3 fw-bold">Switch Streaming Application</h1><h1 id="controller" class="h5 mb-3">Controller Used: None (Please connect a controller and press an input.)</h1><div id="remoteVideos"></div>';
    //<h3>Logs</h3><div id="logs"></div> <-- add this somewhere in the innerHTML if you want some basic logging.

    let dict = {}; // dictionary to track button inputs shorter than 64ms
    let gamepadPrev = null;

    gamepad.bind(Gamepad.Event.CONNECTED, function(device) {
        if (currentController == null) {
            currentController = device;
            document.getElementById("controller").innerHTML = 'Controller Used: ' + device.index + ': ' + device.id;
        }
    });

    gamepad.bind(Gamepad.Event.DISCONNECTED, function(device) {
        if (currentController != null) {
            if (device.index == currentController.index && device.id == currentController.id) {
                currentController = null;
                document.getElementById("controller").innerHTML = 'Controller Used: None (Please connect a controller and press an input.)'
            }
        }
    });

    gamepad.bind(Gamepad.Event.TICK, function(gamepads) {
        deliver = false
        if (Date.now() > next_scan) {
            deliver = true
        }
        // gamepad disconnected
        var gamepad,
            wrap,
            control,
            value,
            i,
            j;
        if (currentController != null) {
            for (i = 0; i < gamepads.length; i++) {
                gamepad = gamepads[i]
                if (gamepad.id == currentController.id && gamepad.index == currentController.index) {
                    if (gamepadPrev) {
                        if (gamepad) {
                            let index = 0
                            for (control in gamepad.state) {
                                value = gamepad.state[control];
                                if (gamepadPrev.state[control] != value && typeof value == 'number') {
                                    if (index == 6 || index == 7 || index > 16) {
                                        // axis: just store whatever the most recent value is.
                                        dict[index] = value
                                    } else {
                                        // button: check previous state and react.
                                        if (dict[index] == null) {
                                            if (value == 1) {
                                                dict[index] = Date.now()
                                            } else {
                                                dict[index] = value
                                            }
                                        } else {
                                            if (dict[index] > 64) { // meaning it does not store a net time
                                                // button was pressed, and now it's released!
                                                dict[index] = Date.now() - dict[index]
                                            }
                                            // ignore it otherwise... a 3 inputs in 64 ms is possible but almost never happens
                                        }
                                    }
                                }
                                index++
                            }
                        }
                    }
                }
            }
        }
        gamepadPrev = gamepad
        if (deliver) {
            let resultString = ''
            let result = new ArrayBuffer(2 * Object.keys(dict).length)
            let uint8Array = new Uint8Array(result)
            let index = 0
            for (let [button_num, value] of Object.entries(dict)) {
                // create byte response
                // code: 5 bits: button number
                //       1 bit: was button release between ticks?
                //       4 bits: how long was button held down? (ms * 4) (ignore if previous bit is 0, else ignore everything following)
                //       1 bit: was the value delivered negative?
                //       5 bits: what is the magnitude of the value? 
                resultString += (button_num >>> 0).toString(2).padStart(5, '0') // 5 bits to determine control

                if (value > 1 && value < 64) { // button was held and released between sends
                    resultString += "1" + (Math.trunc(value / 4)).toString(2).padStart(4, '0')
                    resultString += "0" + "00000" // don't care about the rest
                } else {
                    if (value > 64) {
                        value = 1
                    }
                    resultString += "0" + "0000" // don't care about the first part
                    if (value < 0) {
                        resultString += "1"
                        value *= -1
                    } else {
                        resultString += "0"
                    }
                    value = Math.trunc(value * 31)
                    resultString += (value >>> 0).toString(2).padStart(5, '0')
                }
                // convert into byte data
                uint8Array[index] = parseInt(resultString.substring(8 * index, 8 * (index + 1)), 2)
                uint8Array[index + 1] = parseInt(resultString.substring(8 * (index + 1), 8 * (index + 2)), 2)
                index += 2
            }
            if (uint8Array.length != 0) {
                socket.send(result)
                dict = {}
                next_scan = next_scan + throttle
            }
        }
    });

    const pc = new RTCPeerConnection({
        iceServers: [{
                urls: STUN_SERVER,
            },
            {
                urls: TURN_SERVER,
                username: username,
                credential: credential,
            },
        ],
    });
    const log = (msg) => {
        // document.getElementById("logs").innerHTML += msg + "<br>"; <-- Uncomment for basic logging.
    };

    pc.ontrack = (event) => {
        const el = document.createElement(event.track.kind);
        el.srcObject = event.streams[0];
        el.autoplay = true;
        el.controls = false;
        document.getElementById("remoteVideos").appendChild(el);
    };

    pc.oniceconnectionstatechange = (e) => log(pc.iceConnectionState);
    pc.onicecandidate = (event) => {
        if (event.candidate === null) {
            socket = new WebSocket("ws://" + serverIP + ":" + wsPort + "/ws");

            socket.onopen = function(e) {
                log("connected to remote websocket");
                socket.send(btoa(JSON.stringify(pc.localDescription))); // first message should be the base64
            };

            socket.onmessage = function(e) {
                // only message should be the response
                try {
                    pc.setRemoteDescription(
                        new RTCSessionDescription(JSON.parse(atob(e.data)))
                    );
                } catch (e) {
                    alert(e);
                }
            };

            socket.onclose = function(e) {
                alert("Remote WebSocket connection closed");
            };
        }
    };

    // Offer to receive 1 video track & 1 audio track
    pc.addTransceiver("video", {
        direction: "sendrecv",
    });
    pc.addTransceiver('audio', {
        direction: "sendrecv",
    })
    pc.createOffer()
        .then((d) => pc.setLocalDescription(d))
        .catch(log);
}