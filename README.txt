LIBERTY CITY RADIO RELAY v5
===========================

Purpose:
- Gives the online CAD a public /dispatch endpoint.
- Relays CAD incidents live to connected radio browser clients.
- Shows recent dispatches.
- Plays alert tone and spoken dispatch.
- Includes live PTT start/stop signaling.

Deploy to Render:
1. Make a new GitHub repository, for example liberty-city-radio-relay.
2. Upload the CONTENTS of this folder.
3. In Render choose New Web Service and select the repository.
4. Docker will be detected automatically.
5. Deploy.
6. Open the Render URL and confirm the radio page loads.
7. Your CAD environment variable becomes:
   RADIO_API=https://YOUR-RADIO-URL.onrender.com/dispatch
8. Save the CAD environment variable and redeploy the CAD.

Health test:
https://YOUR-RADIO-URL.onrender.com/health

NOTE:
This v5 relay includes dispatch alerts and PTT signaling. Actual browser microphone
audio streaming between users is the next stage and requires WebRTC/media handling.
