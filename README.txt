LIBERTY CITY RADIO RELAY v5.1
=============================

NEW IN v5.1
- Real browser microphone Push-To-Talk using WebRTC
- Callsign registration
- Connected-user count
- Hold PTT to transmit; release to stop
- Receiving indicator shows transmitting callsign
- Existing CAD /dispatch endpoint remains unchanged
- Existing dispatch feed, tones, and spoken dispatch remain

UPDATE YOUR EXISTING RENDER RADIO SERVICE
1. Extract this ZIP.
2. Upload the CONTENTS of liberty-city-radio-relay-v5.1 to the SAME GitHub
   radio repository you already use.
3. Commit changes.
4. Render should redeploy automatically.
5. Open the radio page.
6. Enter a callsign.
7. Click Enable Radio Audio.
8. Click Enable Microphone and choose Allow when the browser asks.
9. Test with TWO separate devices/browsers. Both must have the radio page open.
10. On one device hold HOLD TO TALK and speak. The other should hear it.

IMPORTANT
- The site must be served over HTTPS for browser microphone access. Render HTTPS works.
- For the easiest first test, use two separate devices to avoid echo.
- WebRTC audio is peer-to-peer. The Render server handles signaling, not the audio itself.
- A STUN server is configured. Some restrictive networks may require a TURN server later.
- CAD integration does NOT need a new RADIO_API value; /dispatch is unchanged.
