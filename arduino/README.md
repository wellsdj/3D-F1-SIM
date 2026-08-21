# Arduino controller

Steering joystick + two pedal buttons + a 4-digit lap-time display, talking to
the game over USB serial (Web Serial API — Chrome or Edge on desktop only).

Flash `joystick_controller.ino` to the Arduino, wire it up per the comment
block at the top of that file, then in the game click the **joystick button**
in the HUD (top left) and pick the Arduino's serial port when the browser
asks. Click it again any time to recentre the steering.

## What you need (from the Elegoo Most Complete Starter Kit)

- The joystick module (3 analog/digital pins + power)
- 2 momentary pushbuttons, for accelerator and brake
- A bare 4-digit 7-segment display (12 pins, common cathode) + a 74HC595
  shift register
- 8 resistors, 1kΩ or higher, one per display segment (a,b,c,d,e,f,g,dp)
- Breadboard + jumper wires

## Wiring summary

| From | To |
|---|---|
| Joystick VRx | A0 |
| Joystick SW (click) | D2 |
| Joystick +5V / GND | 5V / GND |
| Accel button | D3 → GND |
| Brake button | D4 → GND |
| Display digit 1–4 (common cathode pins) | D5, D6, D7, D8 |
| 74HC595 DS (pin 14) | D9 |
| 74HC595 SH_CP (pin 11) | D10 |
| 74HC595 ST_CP (pin 12) | D11 |
| 74HC595 MR (pin 10) | 5V |
| 74HC595 OE (pin 13) | GND |
| 74HC595 VCC / GND | 5V / GND |
| 74HC595 Q0–Q7 → display segments a–g,dp | through one 1kΩ resistor each |

Buttons and the joystick's own click use the Arduino's internal pull-ups, so
they wire straight to GND with no resistor.

**Bare 12-pin displays aren't all pinned out the same way.** If digits show
scrambled or wrong segments light up, it's almost always the segment-to-Q
wiring or `SEGMENT_MAP` in the sketch that needs reordering to match your
actual part — see the note in the sketch's wiring comment for how to check
it with a multimeter/battery continuity test.

## What else is needed

- Nothing beyond the Arduino IDE and a USB cable — the sketch only uses
  built-in Arduino functions (`shiftOut`, `analogRead`, `Serial`), no extra
  libraries to install.
- The board needs to enumerate as a standard USB-serial device (any Uno/Nano/
  Mega works fine); no special driver beyond what the Arduino IDE already
  installs for you.
- Web Serial only works in Chrome or Edge, over a real (non-`file://`)
  origin or `localhost` — it's disabled in Firefox/Safari and in an iframe
  without permission, and the site should already be served over HTTPS in
  production so this isn't a concern once deployed.

## Protocol

Board → game, ~50 Hz: `x,accel,brake,click\n` — `x` is the raw joystick
X-axis reading (0–1023), the other three are 1/0.

Game → board, 10 Hz: `<milliseconds>\n` — the live lap time in whole
milliseconds (0 while no lap is running). The board formats this itself as
`M:SS.d` across the four digits.
