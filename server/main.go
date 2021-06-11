package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/gorilla/websocket"
	"github.com/pion/webrtc/v3"
)

const tcpPort = 1337
const websocketPort = 13370

var tcpConn net.Conn
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func debugPrint(message string) {
	if os.Getenv("SWITCH_DEBUG") == "1" {
		fmt.Println(message)
	}
}

func wsEndpoint(w http.ResponseWriter, r *http.Request) {
	upgrader.CheckOrigin = func(r *http.Request) bool { return true }
	// upgrade this connection to a WebSocket
	// connection
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
	}
	log.Println("Client Connected")
	// start listening on websocket for gamepad inputs
	reader(ws)
}

func reader(conn *websocket.Conn) {

	var peerConnection *webrtc.PeerConnection
	var audioPipeline *Pipeline
	var videoPipeline *Pipeline
	sdpReceived := false

	for {
		// read in a message
		_, byteArr, err := conn.ReadMessage()
		
		if err != nil {
			// connection was closed or otherwise interrupted. close cleanly
			debugPrint(err.Error())
			debugPrint("Closing peer connection")
			audioPipeline.Stop()
			videoPipeline.Stop()
			peerConnection.Close()
			return
		}
		// print out that message for clarity
		debugPrint(fmt.Sprintf("- Read: %x\n", byteArr))

		if !sdpReceived { // should be the first thing we received, guaranteed by TCP
			// based on pion gstreamer-send example
			audioSrc := "alsasrc device=hw:1 ! queue ! audioconvert"
			videoSrc := "v4l2src device=/dev/video0 ! image/jpeg, width=1280, height=720, pixel-aspect-ratio=1/1, framerate=50/1 ! queue ! jpegparse ! jpegdec ! queue ! videoscale ! queue"
			// videotestsrc
			sdpReceived = true
			// use SDP to start streaming video
			offer := webrtc.SessionDescription{}
			sdp := string(byteArr)
			Decode(sdp, &offer)

			config := webrtc.Configuration{
				ICEServers: []webrtc.ICEServer{
					{
						URLs: []string{"stun:stun.l.google.com:19302"},
					},
				},
			}

			// Create a new RTCPeerConnection
			peerConnection, err = webrtc.NewPeerConnection(config)
			if err != nil {
				panic(err)
			}

			// Set the handler for ICE connection state
			// This will notify you when the peer has connected/disconnected
			peerConnection.OnICEConnectionStateChange(func(connectionState webrtc.ICEConnectionState) {
				debugPrint(fmt.Sprintf("Connection State has changed %s \n", connectionState.String()))
			})

			// Create a audio track
			audioTrack, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{MimeType: "audio/opus"}, "audio", "pion1")
			if err != nil {
				panic(err)
			}
			_, err = peerConnection.AddTrack(audioTrack)
			if err != nil {
				panic(err)
			}

			// Create a video track
			firstVideoTrack, err := webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{MimeType: "video/h264"}, "video", "pion2")
			if err != nil {
				panic(err)
			}
			_, err = peerConnection.AddTrack(firstVideoTrack)
			if err != nil {
				panic(err)
			}

			// Set the remote SessionDescription
			err = peerConnection.SetRemoteDescription(offer)
			if err != nil {
				panic(err)
			}

			// Create an answer
			answer, err := peerConnection.CreateAnswer(nil)
			if err != nil {
				panic(err)
			}

			// Create channel that is blocked until ICE Gathering is complete
			gatherComplete := webrtc.GatheringCompletePromise(peerConnection)

			// Sets the LocalDescription, and starts our UDP listeners
			err = peerConnection.SetLocalDescription(answer)
			if err != nil {
				panic(err)
			}

			// Output the answer in base64 so we can paste it in browser
			<-gatherComplete
			response := Encode(*peerConnection.LocalDescription())
			err = conn.WriteMessage(1, []byte(response))
			if err != nil {
				panic(err)
			}

			// Start pushing buffers on these tracks
			audioPipeline = CreatePipeline("opus", []*webrtc.TrackLocalStaticSample{audioTrack}, audioSrc)
			audioPipeline.Start()
			videoPipeline = CreatePipeline("h264", []*webrtc.TrackLocalStaticSample{firstVideoTrack}, videoSrc)
			videoPipeline.Start()
		} else {
			// pass data to python code
			tcpConn.Write(byteArr)
		}
	}
}

func main() {
	// open websocket
	http.HandleFunc("/ws", wsEndpoint)
	// create tcp connection with Python code (should already be running and connected to the Switch)
	var err error
	tcpConn, err = net.Dial("tcp", fmt.Sprintf("localhost:%d", tcpPort))
	if err != nil {
		log.Fatal("Could not establish connection with Python!")
	}
	// set websocket port
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", websocketPort), nil))

}

// Encode encodes the input in base64
func Encode(obj interface{}) string {
	b, err := json.Marshal(obj)
	if err != nil {
		panic(err)
	}

	return base64.StdEncoding.EncodeToString(b)
}

// Decode decodes the input from base64
func Decode(in string, obj interface{}) {
	b, err := base64.StdEncoding.DecodeString(in)
	if err != nil {
		panic(err)
	}

	err = json.Unmarshal(b, obj)
	if err != nil {
		panic(err)
	}
}