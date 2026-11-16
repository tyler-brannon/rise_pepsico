# Rise v. PepsiCo: Live Classroom Prediction Market

One market: **Who has the better trademark argument: RiseandShine or PepsiCo?**
Students bet $1,000 of play money from their phones while you present. Prices move live
with the class's buying and selling, and the leaderboard ranks everyone by portfolio value.

| Page | Who | What |
|---|---|---|
| `/` | Students (phones) | Join with a nickname, buy/sell, see portfolio, activity and rankings |
| `/screen` | Projector | Big live odds, price chart, live trades, and a QR code to join. Switches to final standings when you close trading |
| `/admin` | You | Close/reopen trading, remove a nickname, reset the market |

## Deploy free on Render (recommended)

1. Push this folder to a GitHub repo.
2. Go to [render.com](https://render.com), sign in with GitHub, then **New → Blueprint** and pick the repo
   (it reads `render.yaml`). Or use **New → Web Service** with build `npm install` and start `npm start`.
3. When asked, set **ADMIN_PASSWORD** to something only you know.
4. You get a URL like `https://rise-v-pepsico-market.onrender.com`. Open `/screen` on the projector.

**Free tier notes**
- The server goes to sleep after ~15 minutes with no visitors, and waking it takes ~1 minute.
  **Open the site about 2 minutes before class.**
- Sleeping or redeploying **wipes the market** (free disks aren't persistent). That's fine for one
  session, but don't leave it idle mid-presentation for 15+ minutes.

## Run on your laptop instead

```
npm install
npm start
```
Students on the same Wi-Fi go to `http://<your-laptop-IP>:3000` (the projector QR code
uses whatever address you open `/screen` with, so open it via your IP, not `localhost`).
School Wi-Fi often blocks device-to-device traffic. If so, use Render.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD` | `lawclass` | Password for `/admin`. **Change it.** |
| `START_CASH` | `1000` | Play money per student |
| `LIQUIDITY` | `3000` | How hard prices are to move. At 3000, one student going all-in moves 50% to about 64%. Lower = more volatile |

## How the market works

An automated market maker (LMSR) always quotes a price for each side. Prices sit between 1¢ and 99¢
and add up to $1, so they read as the class's live probability. Buying pushes a side up and selling
pushes it down. Because the case hasn't been decided, nothing "pays out". Each student's score is
**cash + shares × current price**, and when you close trading on `/admin` those scores freeze into
the final standings.

## Suggested flow

1. Before class: open `/admin` and **Reset market**. Put `/screen` on the projector.
2. Students scan the QR code and pick nicknames.
3. As you walk through the earlier rulings and arguments, students trade. The chart shows the
   class's opinion swinging.
4. At the end: **Close trading** and the projector shows the final standings.
