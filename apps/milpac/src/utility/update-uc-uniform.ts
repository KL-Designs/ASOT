import FormData from "form-data";
import axios from "axios";
async function updateUCUniform(ucID: string, data: Buffer): Promise<void> {
  try {
    // Ensure the ucID is valid
    if (!ucID) {
      throw new Error("Invalid UC ID provided");
    }

    const form = new FormData();
    form.append("image", data, {
      filename: "avatar.png",
      contentType: "image/png",
    });
    const headers = {
      ...form.getHeaders(),
      Authorization: `Bot ${process.env.UC_API_KEY}`,
    };
    await axios
      .post(
        `https://api.unitcommander.co.uk/community/230/profiles/${ucID}/background`,
        form,
        {
          headers: headers,
        }
      )
      .catch((err) => {
        console.log(
          "Error updating avatar: ",
          err.response?.data || err.message
        );
      });
  } catch (error) {
    console.error("Error updating UC uniform:", error);
    throw error; // Re-throw the error for further handling
  }
}

export { updateUCUniform };
