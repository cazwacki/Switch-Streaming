# Switch-Stream
This is a proof-of-concept allowing for remote play on a Switch through the web browser. A server is connected via capture card to the Switch's HDMI (video / audio) and returns it to a remote browser via WebRTC, resulting in a latency of 200-300ms. Gamepad inputs are read by the remote browser and sent to the server, which translates the inputs and uses two Arduino Micros to relay and translate inputs into joystick inputs to the Switch. One of the Arduino Micros emulates a HORI Pokken Tournament Pad and the other Arduino relays input to that emulating Arduino via I2C communication.
## Video Demonstration
https://youtu.be/yyRQYroEMno

## Hardware Requirements
- A computer that can work as a Linux server. I have this running in an Ubuntu VM in unRAID.
- Decent bandwidth to transmit the stream. Some online research suggests ~200kbps that can be dedicated to this is a good baseline.
- Capture card to capture video and audio. I used an AVerMedia Live Gamer Mini.
- Two Arduino devices at least one of which is based on the ATmega32u4 (I used a knockoff Arduino Micro).

## Software Requirements (Server)
Quick Install all dependencies other than Go (Debian-based Linux):
```
sudo apt-get update -y
sudo apt-get install -y libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-bad1.0-dev gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-doc gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-gl gstreamer1.0-gtk3 gstreamer1.0-qt5 gstreamer1.0-pulseaudio coturn alsa-utils v4l-utils
```
- [Go 1.16 or later](https://tecadmin.net/how-to-install-go-on-ubuntu-20-04/)
- [GStreamer w/ Plugins](https://gstreamer.freedesktop.org/documentation/installing/on-linux.html?gi-language=c): This takes the video and audio from the capture card and we use WebRTC to stream it.
- [STUN and TURN server](https://nextcloud-talk.readthedocs.io/en/latest/TURN/): These are used for negotiating a connection between the remote browser and the local machine streaming video and audio. If you want secure connections, you should use LetsEncrypt to acquire an SSL certificate for these servers. I recommend using coTURN, but you can use your own implementations if you prefer.
- ALSA: provides audio and MIDI functionality to the Linux operating system.
- V4L2: a collection of device drivers and an API for supporting realtime video capture on Linux systems.

## Setup
### Arduinos
1. Create a board configuration in your Arduino installation at hardware\arduino\avr\boards.txt and enter the following:
```
myboard.name=SwitchJoystick
myboard.vid.0=0x0F0D
myboard.pid.0=0x8092
myboard.vid.1=0x0F0D
myboard.pid.1=0x0092

myboard.upload.tool=avrdude
myboard.upload.protocol=avr109
myboard.upload.maximum_size=28672
myboard.upload.maximum_data_size=2560
myboard.upload.speed=57600
myboard.upload.disable_flushing=true
myboard.upload.use_1200bps_touch=true
myboard.upload.wait_for_upload_port=true

myboard.bootloader.tool=avrdude
myboard.bootloader.low_fuses=0xff
myboard.bootloader.high_fuses=0xd8
myboard.bootloader.extended_fuses=0xcb
myboard.bootloader.file=caterina/Caterina-Leonardo.hex
myboard.bootloader.unlock_bits=0x3F
myboard.bootloader.lock_bits=0x2F

myboard.build.mcu=atmega32u4
myboard.build.f_cpu=16000000L
myboard.build.vid=0x0F0D
myboard.build.pid=0x0092
myboard.build.usb_product="POKKEN CONTROLLER"
myboard.build.board=AVR_LEONARDO
myboard.build.core=arduino
myboard.build.variant=leonardo
myboard.build.extra_flags={build.usb_flags}
```
2. Add the Switch Joystick library specified in the repo to your Arduino libraries.
3. In the Arduino IDE, swap the board type to the SwitchJoystick one we added above.
4. Upload `switch-translator.ino` to an Arduino with the ATmega32u4.
5. Swap the board type to whatever is appropriate for the other Arduino.
6. Upload `input-relay.ino` to that Arduino.
7. Set up the Arduinos on a breadboard; connect the SDA pins to each other, the SCL pins to each other, and the ground pins to each other to set up I2C communication.
### Server
1. Set up your coTURN server. I followed [this guide](https://gabrieltanner.org/blog/turn-server).
2. Open a port in your router and your server for WebSocket connection, and assign that number in main.go as `websocketPort`.
3. Plug the input relay Arduino into the Linux server, and plug the Switch translator Arduino into the Switch dock.
4. Specify the device address registered in Linux (can be found via `dmesg`); assign that path in main.go as `arduinoDevicePath`.
### Client
1. Assign your TURN server's username and credential in login-and-control.js as well as the IP of the server hosting the Switch Streaming and WebSocket Port opened previously.
2. Add the STUN and TURN servers you have in the STUN_SERVER and TURN_SERVER constants in the same file.
## Runtime
1. Turn on the Nintendo Switch, and go to home menu.
2. Run `go build && sudo ./switch_stream_server` in the server directory.
3. On the client side, open index.html, enter in the necessary credentials, and send inputs to the Switch and receive audio / video from it!

Any controller compatible with the Mozilla GamePad API will work with the client!