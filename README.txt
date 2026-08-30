LIBERTY CITY RADIO RELAY v5.2
=============================

NEW IN v5.2
- Radio channels:
  * Dispatch
  * Fireground 1
  * Fireground 2
  * Command
- Voice traffic is isolated by channel
- Channel roster showing callsigns and their current channels
- PTT key-up and key-down radio beeps
- Channel-busy protection
- Emergency button with system-wide emergency alert
- Improved fire-radio console layout
- Live connected-user count and clock
- Callsign and selected channel are remembered in the browser

KEPT FROM v5.1
- Real WebRTC microphone Push-To-Talk
- CAD /dispatch integration
- Dispatch tones and spoken dispatch
- Dispatch feed
- HTTPS microphone support

UPDATE YOUR EXISTING RENDER RADIO SERVICE
1. Extract this ZIP.
2. Upload the CONTENTS of liberty-city-radio-relay-v5.2 into the SAME GitHub radio repository.
3. Replace the existing files and Commit changes.
4. Render should redeploy automatically.
5. Refresh the radio page with Ctrl+F5.
6. Enable Radio Audio and Enable Microphone on each client.
7. Select matching channels to talk to each other.
8. Test PTT.
9. Try moving one client to a different channel; it should no longer hear the first.
10. Test the EMERGENCY button.

CAD RADIO_API DOES NOT CHANGE:
https://liberty-city-radio-relay.onrender.com/dispatch

NOTE
WebRTC remains peer-to-peer and currently uses public STUN. Very restrictive networks may
need a TURN service later for reliable voice connectivity.
