// defaults for your connection
const DEFAULT_USERNAME = "username"
const DEFAULT_CREDENTIAL = "password"
const DEFAULT_SERVER = "127.0.0.1"
const DEFAULT_PORT = 13370
const STUN_SERVER = "stun server ip:port"
const TURN_SERVER = "turn server ip:port"

// set defaults for entries
document.getElementById("username").value = DEFAULT_USERNAME;
document.getElementById("credential").value = DEFAULT_CREDENTIAL;
document.getElementById("server").value = DEFAULT_SERVER;
document.getElementById("port").value = DEFAULT_PORT;

// set up gamepad behaviors
let gamepads = navigator.getGamepads()
let prev_gamepads = []
let socket = null;
let trigger_threshold = 0.85
let magnitudes = [0, 0, 0, 0]
let triggers = [0, 0]

window.addEventListener("gamepadconnected", function (e) {
    console.log("Gamepad connected: %s. %d buttons, %d axes.",
        e.gamepad.id,
        e.gamepad.buttons.length, e.gamepad.axes.length);
    let gamepad_index = e.gamepad.id + e.gamepad.index
    gamepads[gamepad_index] = e.gamepad
    prev_gamepads[gamepad_index] = gamepads[gamepad_index]
});

window.addEventListener("gamepaddisconnected", function (e) {
    console.log("Gamepad disconnected: %s. %d buttons, %d axes.",
        e.gamepad.id,
        e.gamepad.buttons.length, e.gamepad.axes.length);
    let gamepad_index = e.gamepad.id + e.gamepad.index
    delete gamepads[gamepad_index]
    delete prev_gamepads[gamepad_index]
});

setInterval(detectAndSend, 20);

// function controller input loop
function detectAndSend() {
    gamepads = navigator.getGamepads()
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && prev_gamepads[i] && !equivalentInputStates(gamepads[i], prev_gamepads[i])) {
            // convert input information to bits and send
            if (socket) {
                sendNewState(gamepads[i], prev_gamepads[i])
            }
            logNewState(gamepads[i], prev_gamepads[i])
            break;
        }
    }
    prev_gamepads = navigator.getGamepads()
}

// upon clicking "connect", this executes.
function initializeWebRTC() {
    const username = document.getElementById("username").value;
    const credential = document.getElementById("credential").value;
    const serverIP = document.getElementById("server").value;
    const wsPort = document.getElementById("port").value;

    document.getElementById("content").innerHTML = '<h1 id="title" class="h3 mb-3 fw-bold">Switch Streaming Application</h1><div id="remoteVideos"></div>';

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
            socket.binaryType = "arraybuffer";

            socket.onopen = function (e) {
                log("connected to remote websocket");
                socket.send(btoa(JSON.stringify(pc.localDescription))); // first message should be the base64
            };

            socket.onmessage = function (e) {
                // only message should be the response
                try {
                    pc.setRemoteDescription(
                        new RTCSessionDescription(JSON.parse(atob(e.data)))
                    );
                } catch (e) {
                    alert(e);
                }
            };

            socket.onclose = function (e) {
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

function equivalentInputStates(gamepad1, gamepad2) {
    return false
}

/**
 * 1 bit: axis or button
 * 5 bits: determine button, 1 bit: pressed or released
 * 2 bits: determine axis, 4 bits: determine magnitude (15 is plenty lol)
 */
const BUTTON = 0b0000000
const AXIS = 0b1000000
const AXIS_INDEX = function (i) { return i << 4 }
const BUTTON_INDEX = function (i) { return i << 1 }
const MAGNITUDE = function (m) { return Math.floor((m + 1) * 7.5) }

function sendNewState(gamepad1, gamepad2) {
    // send axes data
    for (let i = 0; i < gamepad1.axes.length; i++) {
        if (gamepad1.axes[i] != gamepad2.axes[i] && MAGNITUDE(gamepad1.axes[i]) != magnitudes[i]) {
            magnitudes[i] = MAGNITUDE(gamepad1.axes[i])
            let message_container = new Uint8Array(1);
            message_container[0] = AXIS | AXIS_INDEX(i) | magnitudes[i]
            socket.send(message_container.buffer)
        }
    }
    // send button data
    for (let i = 0; i < gamepad1.buttons.length; i++) {
        if (gamepad1.buttons[i].value != gamepad2.buttons[i].value) {
            let button_value = gamepad1.buttons[i].value > trigger_threshold ? 1 : 0
            if (i >= 6 && i <= 7) {
                if (triggers[6 - i] == button_value) {
                    continue;
                } else {
                    triggers[6 - i] = button_value
                }
            }
            let message_container = new Uint8Array(1);
            message_container[0] = BUTTON | BUTTON_INDEX(i) | button_value
            socket.send(message_container.buffer)
        }
    }
}

// debug version for above
function logNewState(gamepad1, gamepad2) {
    // send axes data
    for (let i = 0; i < gamepad1.axes.length; i++) {
        if (gamepad1.axes[i] != gamepad2.axes[i]) {
            console.log("Axis %d: %f", i, gamepad1.axes[i])
            let message_container = new Uint8Array(1);
            message_container[0] = AXIS | AXIS_INDEX(i) | magnitudes[i]
            console.log(message_container.buffer)
        }
    }
    // send button data
    for (let i = 0; i < gamepad1.buttons.length; i++) {
        if (gamepad1.buttons[i].value != gamepad2.buttons[i].value) {
            let button_value = gamepad1.buttons[i].value > trigger_threshold ? 1 : 0
            console.log(i + ": " + button_value)
            let message_container = new Uint8Array(1);
            message_container[0] = BUTTON | BUTTON_INDEX(i) | button_value
            console.log(message_container.buffer)
        }
    }
}