/*
  3D-F1-SIM controller: joystick steering + two pedal buttons + lap-time display
  --------------------------------------------------------------------------------
  Steering only comes from the joystick's X axis. Accelerator and brake are two
  separate momentary pushbuttons. A 4-digit 7-segment display, driven through a
  74HC595 shift register, shows the live lap time sent back from the game.

  WIRING -- joystick and buttons
    Joystick VRx  -----> A0
    Joystick SW   -----> D2   (stick's own click, resets to the track)
    Joystick +5V  -----> 5V
    Joystick GND  -----> GND
    (VRy is not used)

    Accel button  -----> D3, other leg to GND
    Brake button  -----> D4, other leg to GND

  All three buttons use the board's internal pull-up, so they read HIGH when
  not pressed and LOW when pressed -- no external resistor on any of them.

  WIRING -- 74HC595 shift register
    74HC595 pin 14 (DS,  serial data)  -----> D9
    74HC595 pin 11 (SH_CP, shift clk)  -----> D10
    74HC595 pin 12 (ST_CP, latch clk)  -----> D11
    74HC595 pin 8  (GND)               -----> GND
    74HC595 pin 16 (VCC)               -----> 5V
    74HC595 pin 10 (MR, reset)         -----> 5V   (kept high -- not resetting)
    74HC595 pin 13 (OE, output enable) -----> GND  (kept low -- always enabled)

  WIRING -- 74HC595 outputs (Q0..Q7) to the display's 8 segment pins
    Each of the display's 8 segment pins (a, b, c, d, e, f, g, dp) gets its own
    330ohm-1kohm resistor in series, then into one 74HC595 output. Which output
    drives which segment doesn't matter as long as SEGMENT_MAP below (in the code)
    is edited to match how you actually wired it -- see the note there.
    This code uses 1k per segment: with all 8 segments of one digit lit at once
    and no transistor on the digit-select line, worst case current through a
    single Arduino pin is 8 * (5V - 2V) / 1000ohm = 16mA, safely under the 20mA
    absolute max per pin.

  WIRING -- display digit-select (common cathode) pins
    Digit 1 (leftmost)  -----> D5
    Digit 2             -----> D6
    Digit 3             -----> D7
    Digit 4 (rightmost) -----> D8
    These go straight from the Arduino pin to the digit's common cathode pin,
    no resistor -- the resistors on the segment lines already limit the current.

  IMPORTANT: bare 12-pin 4-digit displays are not wired the same way by every
  supplier. If the digits come up scrambled or a digit lights the wrong
  segments, most likely SEGMENT_MAP or DIGIT_PINS below just needs its order
  changed to match your physical part -- the datasheet or a continuity test
  (5V + resistor to one pin, GND to a digit-select pin, see which segment
  lights) will tell you which of the 12 physical pins is which.

  PROTOCOL
    Sends one line per sample, at 115200 baud:
        x,accel,brake,click\n
    x is the raw analogRead() of the stick, 0-1023. accel, brake and click
    are each 1 while pressed, 0 otherwise.

    Receives lines from the game of the form:
        <milliseconds>\n
    which is the live lap time in whole milliseconds (0 while no lap is
    running). This is shown on the display as M:SS.d (minutes, seconds, and
    one decimal of a second) -- four digits with a decimal point, so "1:23.4"
    is shown as digits 1 2 3 4 with the point after the third digit.
*/

// ---- joystick + buttons -----------------------------------------------
const int PIN_X      = A0;
const int PIN_SW     = 2;
const int PIN_ACCEL  = 3;
const int PIN_BRAKE  = 4;

const unsigned long SEND_INTERVAL_MS = 20;   // ~50 Hz
unsigned long lastSend = 0;

// ---- display: digit-select pins, leftmost to rightmost -----------------
const int DIGIT_PINS[4] = {5, 6, 7, 8};

// ---- display: 74HC595 control pins --------------------------------------
const int PIN_DS   = 9;   // serial data
const int PIN_SHCP = 10;  // shift clock
const int PIN_STCP = 11;  // latch clock

// Segment order this code shifts out, MSB first: a b c d e f g dp.
// If your segment wiring is in a different order, either rewire to match
// this, or reorder the bits inside SEGMENT_MAP below to match your wiring
// instead -- easier to fix in software than by rewiring.
//                                  a b c d e f g dp
const byte SEGMENT_MAP[10] = {
  0b11111100, // 0
  0b01100000, // 1
  0b11011010, // 2
  0b11110010, // 3
  0b01100110, // 4
  0b10110110, // 5
  0b10111110, // 6
  0b11100000, // 7
  0b11111110, // 8
  0b11110110, // 9
};
const byte SEG_BLANK = 0b00000000;
const byte SEG_DP    = 0b00000001;

// what's currently on the display, one byte per digit (segment bits, dp included)
byte digitBits[4] = {SEG_BLANK, SEG_BLANK, SEG_BLANK, SEG_BLANK};

// ---- lap time receive ----------------------------------------------------
String rxBuf = "";
unsigned long lapMs = 0;

// ---- multiplexing (non-blocking, no delay()) -----------------------------
int activeDigit = 0;
unsigned long lastDigitSwitch = 0;
const unsigned long DIGIT_HOLD_US = 3000; // microseconds each digit stays lit

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SW, INPUT_PULLUP);
  pinMode(PIN_ACCEL, INPUT_PULLUP);
  pinMode(PIN_BRAKE, INPUT_PULLUP);

  pinMode(PIN_DS, OUTPUT);
  pinMode(PIN_SHCP, OUTPUT);
  pinMode(PIN_STCP, OUTPUT);
  for (int i = 0; i < 4; i++) {
    pinMode(DIGIT_PINS[i], OUTPUT);
    digitalWrite(DIGIT_PINS[i], LOW);
  }
}

void loop() {
  readJoystickAndSend();
  readLapTimeFromSerial();
  updateDigitsFromLapTime();
  refreshDisplay();
}

void readJoystickAndSend() {
  unsigned long now = millis();
  if (now - lastSend < SEND_INTERVAL_MS) return;
  lastSend = now;

  int x     = analogRead(PIN_X);
  int accel = (digitalRead(PIN_ACCEL) == LOW) ? 1 : 0;
  int brake = (digitalRead(PIN_BRAKE) == LOW) ? 1 : 0;
  int click = (digitalRead(PIN_SW)    == LOW) ? 1 : 0;

  Serial.print(x);     Serial.print(',');
  Serial.print(accel); Serial.print(',');
  Serial.print(brake); Serial.print(',');
  Serial.println(click);
}

void readLapTimeFromSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      if (rxBuf.length() > 0) {
        long v = rxBuf.toInt();
        if (v >= 0) lapMs = (unsigned long)v;
        rxBuf = "";
      }
    } else if (c != '\r') {
      rxBuf += c;
      if (rxBuf.length() > 12) rxBuf = ""; // malformed line, drop it
    }
  }
}

void updateDigitsFromLapTime() {
  // lapMs -> minutes(1 digit), seconds(2 digits), tenths(1 digit): "M:SS.d"
  unsigned long totalTenths = lapMs / 100;
  int tenths  = totalTenths % 10;
  int seconds = (totalTenths / 10) % 60;
  int minutes = (totalTenths / 10) / 60;
  if (minutes > 9) minutes = 9; // display only has one digit for minutes

  digitBits[0] = SEGMENT_MAP[minutes] | SEG_DP;      // "M."
  digitBits[1] = SEGMENT_MAP[seconds / 10];          // tens of seconds
  digitBits[2] = SEGMENT_MAP[seconds % 10];          // units of seconds
  digitBits[3] = SEGMENT_MAP[tenths];                // tenths
  // Layout ends up "M SS d" read as M:SS.d once digit 0's decimal point is on.
}

void refreshDisplay() {
  unsigned long nowUs = micros();
  if (nowUs - lastDigitSwitch < DIGIT_HOLD_US) return;
  lastDigitSwitch = nowUs;

  digitalWrite(DIGIT_PINS[activeDigit], LOW); // blank previous digit first

  activeDigit = (activeDigit + 1) % 4;

  digitalWrite(PIN_STCP, LOW);
  shiftOut(PIN_DS, PIN_SHCP, MSBFIRST, digitBits[activeDigit]);
  digitalWrite(PIN_STCP, HIGH);

  digitalWrite(DIGIT_PINS[activeDigit], HIGH);
}
