import mongoose from "mongoose";
import Account from "./models/userData";
async function initMongo() {
  console.log("Connecting to database");
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL is not set");
  await mongoose.connect(uri);
  console.log("Connected to database");
  const users = await Account.find({});
  for (const user of users) {
    if (user.TrainingMedals) {
      if (user.TrainingMedals.length > 0) {
        if (user.TrainingMedals.includes("Pistol")) {
          const index = user.TrainingMedals.indexOf("Pistol");
          if (index > -1) {
            user.TrainingMedals.splice(index, 1);
          }
          user.TrainingMedals.push("BPistol");
          user.save();
          console.log(`UPDATED ${user.name}`);
        }
      }
    }
  }
  console.log("done");
}
export default initMongo;
