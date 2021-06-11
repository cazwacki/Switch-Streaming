# Switch-Stream
This is a semi-convoluted application as a proof-of-concept that someone could play their Switch from a distance. A server is connected via capture card to the Switch's HDMI (video / audio) and returns it to a remote browser via WebRTC, resulting in a latency of 200-300ms. Gamepad inputs are read by the remote browser and sent to the server, which translates the inputs and takes advantage of a fork of the joycontrol Python package to send corresponding Switch Pro Controller inputs to a Nintendo Switch.
## Video Demonstration
https://youtu.be/yyRQYroEMno

## Hardware Requirements
- A computer that can work as a Linux server
- Decent bandwidth to send the stream through
- Capture card to capture video and audio. I used an AVerMedia Live Gamer Mini.
- Bluetooth compatibility. If you need a USB adapter, I highly recommend the ASUS BT-500 as it had the best response for me.

## Software Requirements
- Go 1.16 or later
- Python3 to run controller_emulator.py
- GStreamer w/ Plugins: This takes the video and audio from the capture card and we use WebRTC to stream it.
- STUN and TURN server: These are used for negotiating a connection between the remote browser and the local machine streaming video and audio. If you want secure connections, you should use LetsEncrypt to acquire an SSL certificate for these servers. I recommend using coTURN, but you can use your own implementations if you prefer.
- ALSA: provides audio and MIDI functionality to the Linux operating system.
- V4L2: a collection of device drivers and an API for supporting realtime video capture on Linux systems.

## Setup
### Server
1. Open a port in your router and your server for WebSocket connection, and assign that number in main.go
2. Choose a port for the local TCP connection between the Go code and the Python code, and assign it in those files.
3. Connect to the switch once. After that, you can use reconnect_bt_addr from the joycontrol package to instantly reconnect to the Switch.
### Client
1. Assign your TURN server's username and credential in login-and-control.js as well as the IP of the server hosting the Switch Streaming and WebSocket Port opened previously.
2. Add the STUN and TURN servers you have in the STUN_SERVER and TURN_SERVER constants in the same file.

## Runtime
### Server
1. Turn on the Nintendo Switch, and go to home menu
2. Run `sudo python3 ./controller_emulator.py` and wait for it to say "Listening for TCP
3. Run `go build && ./switch_stream_server`. The Python code should note that the Go program has connected to it.
4. The remote browser should now be able to connect to your server and send inputs to the Switch and receive audio / video from it!

You should be good to go after finishing these. When clicking connect, you should be able to connect an XInput or PS3/4 controller to your browser and it should start working!
