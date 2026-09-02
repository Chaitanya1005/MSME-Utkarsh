import "dotenv/config";
import fs from "fs";
import { SarvamAIClient } from "sarvamai";

const client = new SarvamAIClient({
  apiSubscriptionKey: process.env.SARVAM_API_KEY,
});

async function main() {
  const audioPath = "./test-audio.wav";

  if (!fs.existsSync(audioPath)) {
    console.error(`Audio file not found: ${audioPath}`);
    process.exit(1);
  }

  console.log("Sending audio to Sarvam...");

  try {
    const response = await client.speechToText.transcribe({
      file: fs.createReadStream(audioPath),
    });

    console.log("\nTranscription successful:");
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error("\nTranscription failed:");
    console.error(error);
  }
}

main();