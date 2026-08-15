import mongoose from "mongoose";
async function initMongo() {
  console.log("Connecting to database");
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL is not set");
  await mongoose.connect(uri);
}
export default initMongo;
