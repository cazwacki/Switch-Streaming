#include <Wire.h>
#include <SoftwareSerial.h>

void setup() {
  // initialize USB communication
  Serial.begin(115200);
  while (!Serial) { }

  // initialize communication with switch translator
  Wire.begin();
}

void loop() {
  if (Serial.available() > 0) {
    Wire.beginTransmission(0x55);
    Wire.write(Serial.read());
    Wire.endTransmission();
  }
}
