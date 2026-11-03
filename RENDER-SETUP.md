# 🎮 Deploy Games Host to Render — free, no Chromebook Linux

This package contains the complete online game and a `render.yaml` Blueprint. The Blueprint selects Render's **Free** plan and **Singapore** region automatically.

You need two free accounts: **GitHub** (stores the code) and **Render** (runs the game). No credit card is needed for Render's Free web service.

## 1. Put the game on GitHub

1. Extract `games-online-render.zip` in your Files app.
2. Go to https://github.com/new and sign in or create a free account.
3. Name the repository **games-host**, choose **Public**, and create it. You do not need to add a README.
4. On the empty repository page, choose **uploading an existing file**.
5. Open the extracted folder and upload the **files and folders inside it** — including `server.js`, `package.json`, `render.yaml`, `lib`, and `public`. Upload the contents, not an extra outer folder. `render.yaml` must be at the repository's top level.
6. Choose **Commit changes**.

## 2. Deploy on Render

1. Go to https://render.com and sign up. Signing in with GitHub is easiest.
2. In the Render dashboard, choose **New → Blueprint**.
3. Connect your GitHub account if prompted, then select the **games-host** repository. Render may ask you to install its GitHub app or grant repository access.
4. Choose the **main** branch. Render should detect `render.yaml` and show one web service named **games-host**.
5. Review that the plan says **Free**, then choose **Deploy Blueprint / Apply**.
6. Wait for the build and health check. When the service says **Live**, click the generated `https://games-host-….onrender.com` address.

Render's Blueprint guide: https://render.com/docs/infrastructure-as-code

## 3. Play with friends

1. Open your Render URL.
2. Scroll to **🌐 Play Online With Friends**.
3. Enter your name, choose a game, and select **Create Online Room**.
4. Send friends the room code or use **Invite link**. They join from their own phones or computers.

### Important Free-plan behaviour

- Render Free **sleeps after 15 minutes without inbound traffic**. The next visitor may wait about a minute while it wakes.
- Sleeping, restarting, or redeploying clears active rooms because they are stored in memory. Create a fresh room after the game wakes.
- Do not choose a paid instance unless you intentionally want to pay.

## Update the game later

Upload the changed files to the same GitHub repository. Render automatically redeploys when the connected branch changes.

## Manual fallback if Blueprint is unavailable

Choose **New → Web Service**, connect the repository, and use:

- **Runtime:** Node
- **Build command:** `npm install --omit=dev`
- **Start command:** `npm start`
- **Instance type:** Free
- **Region:** Singapore
- **Health check path:** `/health`

Then choose **Create Web Service**.
