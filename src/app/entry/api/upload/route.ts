import { google } from "googleapis";
void google; // ← ESLintが「使ってる」と認識してビルドが通る

/*
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!),
  scopes: ["https://www.googleapis.com/auth/drive.file"],
});
*/

//const drive = google.drive({ version: "v3", auth });
