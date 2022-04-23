#include "SwitchJoystick.h"
#include <Wire.h>

void translate_to_input(int byte_count);
void activate_evidence_led();

// Create Joystick
SwitchJoystick_ Joystick;

// Button mapping and tracking
uint16_t web_buttons[17];
bool dpad_pressed[4] = {false, false, false, false};

// Informative LEDs
//bool evidence_led_active = false;
//unsigned long evidence_led_timeout = 0;
//uint8_t evidence_led_pin = 9;

void setup() {
  // initialize switch controller
  Joystick.begin();

  Joystick.setXAxis(128);
  Joystick.setYAxis(128);
  Joystick.setZAxis(128);
  Joystick.setRzAxis(128);

  // initialize communication with input relay
  Wire.begin(0x55);
  Wire.onReceive(translate_to_input);

  // create mapping from web controller buttons to switch buttons
  web_buttons[0] = 2;
  web_buttons[1] = 1;
  web_buttons[2] = 3;
  web_buttons[3] = 0;
  web_buttons[4] = 4;
  web_buttons[5] = 5;
  web_buttons[6] = 6;
  web_buttons[7] = 7;
  web_buttons[8] = 8;
  web_buttons[9] = 9;
  web_buttons[10] = 10;
  web_buttons[11] = 11;
  web_buttons[12] = 0;
  web_buttons[13] = 180;
  web_buttons[14] = 270;
  web_buttons[15] = 90;
  web_buttons[16] = 12;
}

void loop() {

}

/**
   1 bit: axis or button
   BUTTON -- 5 bits: determine button, 1 bit: pressed or released
   AXIS   -- 2 bits: determine axis, 4 bits: determine magnitude (15 is plenty)
*/
const char BUTTON = 0;
const char AXIS = 1;
void translate_to_input(int byte_count) {
  uint8_t input_code = Wire.read();
  uint8_t input_type = input_code >> 6;
  if (input_type == AXIS) {
    uint8_t axis_index = (0b00110000 & input_code) >> 4;
    uint8_t magnitude = 0b00001111 & input_code;
    switch (axis_index) {
      case 0:
        Joystick.setXAxis(17 * magnitude);
        break;
      case 1:
        Joystick.setYAxis(17 * magnitude);
        break;
      case 2:
        Joystick.setZAxis(17 * magnitude);
        break;
      case 3:
        Joystick.setRzAxis(17 * magnitude);
        break;
    }
  } else if (input_type == BUTTON) {
    uint8_t button_index = (0b00111110 & input_code) >> 1;
    uint8_t button_value = 0b00000001 & input_code;
    if (button_index >= 12 && button_index <= 15) { // dpad input
      dpad_pressed[button_index - 12] = button_value == 1;
      // calculate angle of dpad using averages
      uint16_t buttons_pressed = 0;
      uint16_t angle_sum = 0;
      for (int i = 3; i >= 0; i--) {
        if (dpad_pressed[i]) {
          buttons_pressed++;
          angle_sum += web_buttons[button_index];
          if (buttons_pressed == 2 && i == 0 && angle_sum == 270) {
            angle_sum += 360;
          }
        }
      }

      if (buttons_pressed == 0) {
        Joystick.setHatSwitch(-1);
      } else {
        Joystick.setHatSwitch(angle_sum / buttons_pressed);
      }
    } else { // typical button input
      Joystick.setButton(web_buttons[button_index], button_value);
      if (button_index == 5 && button_value == 0) {
        Joystick.setButton(web_buttons[6], button_value); // r button workaround
      }

    }
  }
}
