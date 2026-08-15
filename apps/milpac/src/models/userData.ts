import mongoose from "mongoose";
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
export default mongoose.model("memberdata", model);
/*
name: name,
        rank: rank,
        medallions: medallions,
        citations: citations,
        TrainingMedals: trainingBadges,
        Uniform: uniformColor,
        RifleManBadge : rifle,
        badge: badge,
        */
