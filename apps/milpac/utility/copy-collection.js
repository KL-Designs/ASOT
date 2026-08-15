const userData = require("../dist/models/userData").default;
const mongoose = require("mongoose");
const model = new mongoose.Schema({
  citations: [String],
  medallions: [String],
  name: String,
  rank: String,
  Uniform: String,
  RifleManBadge: String,
  badge: String,
  TrainingMedals: [String],
  joindate: String,
  milpac_url: String,
});
const userdata2 = mongoose.model("memberdata-new", model);
const db = require("../dist/connectDB").default;
require("dotenv").config();
(async () => {
  await db();
  const users = await userData.find();
  for (let user of users) {
    //delete user._id;
    user = user.toObject();
    delete user["_id"];
    delete user["__v"];
    console.log(user);
    await userdata2.create(user);
  }
})();
