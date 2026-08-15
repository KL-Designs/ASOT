const userData = require("../models/userData");
const XLSX = require("xlsx");
const db = require("../src/connectDB");
require("dotenv").config();
(async () => {
  await db();
  var workbook = XLSX.readFile("./Master Sheet.xlsx");
  let data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[9]]);
  for (let d of data) {
    let months = {
      "01": "January",
      "02": "February",
      "03": "March",
      "04": "April",
      "05": "May",
      "06": "June",
      "07": "July",
      "08": "August",
      "09": "September",
      10: "October",
      11: "November",
      12: "December",
    };
    if (!d.Name) return;
    let date = d["Date Joined"].split(" ");
    date[1] = months[date[1]];
    if (date[0].charAt(0) == "0") date[0] = date[0].replace("0", "");
    date = date.join(" ");
    const user = await userData.findOne({ name: d.Name.toUpperCase() });
    if (user)
      await userData.findOneAndUpdate(
        { name: d.Name.toUpperCase() },
        { $set: { joindate: date } },
      );
    else await userData.create({ name: d.Name.toUpperCase(), joindate: date });
  }
})();
