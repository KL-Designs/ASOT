import axios from "axios";

async function main(discordID: string): Promise<string | null> {
  const UC_API_KEY = process.env.UC_API_KEY;
  if (!UC_API_KEY) {
    throw new Error("UC_API_KEY is not set in the environment variables");
  }
  try {
    const resp = await axios.get(
      "https://api.unitcommander.co.uk/community/230/profiles/discord/" +
        discordID,
      {
        headers: {
          Authorization: "Bot " + UC_API_KEY,
        },
      }
    );

    if (!resp) return null;
    if (resp.status !== 200) {
      console.error(
        "Failed to fetch data from UC API:",
        resp.status,
        resp.statusText
      );
      return null;
    }
    const data = resp.data;
    if (!data || !data.id) {
      console.error("No data found for the provided Discord ID");
      return null;
    }
    console.log("Fetched UC ID:", data.id);
    return data.id;
  } catch (error) {
    console.error("Exception occurred while fetching UC ID:", error);
    return null;
  }
}

export default main;
