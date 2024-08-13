import "dotenv/config";
import express from "express";
import axios from "axios";
import {
  Client as DiscordClient,
  GatewayIntentBits,
  Events,
  REST as DiscordREST,
  Routes,
  ChannelType,
} from "discord.js";

const app = express();
app.use(express.json());

const {
  DISCORD_TOKEN,
  WHATSAPP_GRAPH_API_TOKEN,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  PORT = 3000,
} = process.env;

const discordClient = new DiscordClient({
  intents: [GatewayIntentBits.Guilds],
});

discordClient.once(Events.ClientReady, () => {
  console.info(`Logged in as ${discordClient.user.tag}`);
});

discordClient.login(DISCORD_TOKEN);

app.post("/whatsapp/webhook", async (req, res) => {
  // log incoming messages3
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  // check if the webhook request contains a message
  // details on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const contact = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];

  // check if the incoming message contains text
  if (message?.type === "text") {
    // extract the business number to send the reply from it
    const business_phone_number_id =
      req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;

    const fromCellphone = message.from;
    let discordChannel = discordClient.channels.cache.find(
      (channel) => channel.name === fromCellphone,
    );

    if (!discordChannel) {
      const discordGuild = discordClient.guilds.cache.first();

      discordChannel = await discordGuild.channels.create({
        name: fromCellphone,
        type: ChannelType.GuildText,
      });
    }

    console.log("Contact", contact);
    const contactName = contact?.profile?.name || `Customer`;

    // send the incoming message to Discord
    discordChannel.send(`${contactName} escreveu: "${message.text.body}"`);

    // send a reply message as per the docs here https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v20.0/${business_phone_number_id}/messages`,
      content_type: "application/json",
      headers: {
        Authorization: `Bearer ${WHATSAPP_GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        to: fromCellphone,
        text: { body: "Echo: " + message.text.body },
        context: {
          message_id: message.id, // shows the message as a reply to the original user message
        },
      },
    });

    // mark incoming message as read
    await axios({
      method: "POST",
      url: `https://graph.facebook.com/v20.0/${business_phone_number_id}/messages`,
      headers: {
        Authorization: `Bearer ${WHATSAPP_GRAPH_API_TOKEN}`,
      },
      data: {
        messaging_product: "whatsapp",
        status: "read",
        message_id: message.id,
      },
    });
  }

  res.sendStatus(200);
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // check the mode and token sent are correct
  if (mode === "subscribe" && token === WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    // respond with 200 OK and challenge token from the request
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    // respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});
