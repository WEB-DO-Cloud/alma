# Desktop app

The installed desktop app for Mac, Windows and Linux is a client of ALMA Cloud, or of a server you
already run. It does not install a server on the computer.

## Install

Download it from [alma.com.do](https://alma.com.do). The files are `ALMA-mac.dmg`,
`ALMA-Setup.exe`, and `ALMA-linux.AppImage`. The Linux AppImage needs FUSE 2. Windows may say it
does not recognize the installer. That build is not signed yet.

## Choose a server

The first time it opens, the app asks which server to use:

- **ALMA Cloud**: sign in to your account at app.alma.com.do.
- **Existing instance**: connect to an ALMA server you or your team already run. Enter its
  **Server address** and choose **Check connection**.

The installed app does not offer **This computer**. That choice starts a local Docker server, and
it is only in an unpackaged development build, or a packaged build started with
`ALMA_DESKTOP_LOCAL_SERVER=1`.

To switch later, use **Change ALMA Server…** in the app menu (Cmd+Shift+K, or Ctrl+Shift+K on
Windows and Linux).

## Let bots use this computer

The desktop app can give bots access to the computer it runs on, to run commands and work with your
files.

- Turn on **Let bots use this computer** in **Settings → General** under **Computers**. Your
  computer then shows as **Connected** or **Offline** there. **Computer Access…** in the app menu
  changes this later, and **Revoke Local Computer Access** turns it off.

The app asks **Allow bots to use this computer?** before access is granted. See
[The bot's computer](./computer.md#use-your-own-computer).

> [!WARNING]
> With **Use this Mac**, bots can run commands without asking. Don't choose it for a server other
> people use.

## Updates

The app checks for updates and downloads them in the background. When one is ready, an
**Install update** button appears at the bottom of the sidebar, or choose **Restart** when asked.
**Check for Updates…** in the app menu checks now.

## Shortcuts

Windows and Linux use Ctrl where macOS uses Cmd. The desktop app lists them in its menus.

- Cmd+N: create a bot, group or space.
- Cmd+K: open the command menu to jump to any bot.
- Cmd+1 to Cmd+9 (desktop app): open one of the first nine bots in the sidebar.
- Ctrl+Tab / Ctrl+Shift+Tab (desktop app): switch to the next or previous bot.
- Cmd/Ctrl+Shift+Down / Cmd/Ctrl+Shift+Up (browser): switch to the next or previous bot.
- Cmd+[ / Cmd+] (Alt+Left / Alt+Right on Windows and Linux, desktop app): go back or forward.
- Cmd+F (desktop app): search.
- Cmd+B: show or hide the sidebar.
- Cmd+, (desktop app): open Settings.
- Esc in the message box: stop the bot's reply.
- Typing anywhere outside a text field starts a message.

The dock icon shows a badge count of unread chats.
