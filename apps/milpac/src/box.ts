import canvas from "canvas";
const { createCanvas, loadImage } = canvas;
import fs from "fs";
import path from "path";
import * as medalJSON from "../medals.json";
import { boxDataRaw } from "./types";
//@ts-expect-error Just a font import, no functions or anything
import times_new_roman from "@canvas-fonts/times-new-roman";
canvas.registerFont(times_new_roman, {
  family: "Times New Roman",
});
const conjoined = [
  ...medalJSON.eighth_line.reverse(),

  ...medalJSON.seventh_line.reverse(),
  ...medalJSON.sixth_line.reverse(),
  ...medalJSON.fifth_line.reverse(),
  ...medalJSON.fourth_line.reverse(),
  ...medalJSON.third_line.reverse(),
  ...medalJSON.second_line.reverse(),
  ...medalJSON.first_line.reverse(),
];
const main = async (data: boxDataRaw) => {
  try {
    const canvas = createCanvas(951, 340);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      await loadImage(__dirname + "/../medal-box-images/backboard.png"),
      0,
      0,
      951,
      340
    );
    const medals = data.medals;
    console.log(medals);
    //arrange the elements of the arrays labelled eight_line, sixth_line and so on from the medals.json file
    //they should be arranged so the eight line if the first element of the conjoined array
    //the ninth line should be the second element of the conjoined array
    //the seventh line should be the third element of the conjoined array and so on

    //iterate through the conjoined array
    const foundMedals = conjoined
      .filter((medal) => medals.includes(medal))
      .reverse();
    console.log("found" + foundMedals);
    //left  - 85,98
    //right - 795, 99
    //one medal is 70x153
    const left = 84;
    const right = 795;
    const top = 102;
    const length = right - left;
    const medalLength = foundMedals.length * 34;
    console.log(length, medalLength, foundMedals.length);
    // const centreDifference = length / 2 - medalLength / 2;
    //console.log(centreDifference + " " + medalLength);
    const start = right - (length - medalLength) / 2;
    let counter = 0;

    for (const medal of foundMedals) {
      //draw the medals so that the centre of medalLength is the centre of the box
      const medalImage = await loadImage(
        __dirname + `/../medal-box-images/medals/${medal}.png`
      );
      console.log(start - counter * 35);
      //each medal overlaps the previous medal by 1/3 of its length
      ctx.drawImage(medalImage, start - counter * 34, top, 74, 155);
      counter++;
    }
    ctx.drawImage(
      await loadImage(__dirname + "/../medal-box-images/case_glass.png"),
      0,
      0,
      951,
      340
    );
    ctx.drawImage(
      await loadImage(__dirname + "/../medal-box-images/border.png"),
      0,
      0,
      951,
      340
    );
    const buffer = canvas.toBuffer("image/png");
    fs.writeFileSync(
      path.resolve(__dirname, `../medal-box-images/boxes/${data.name}.png`),
      buffer
    );
  } catch (err) {
    console.log(err);
  }
  return __dirname + `/../medal-box-images/boxes/${data.name}.png`;
};
/*
main({
  medals: [
    "Group Development",
    "Public Relation",
    "Senior Leadership",
    "Junior Leadership",
    "1 year",
    "2 Year",
    "3 Year",
    "4 Year",

    "Gallantry",
    "Founders",
    "Diplomat",
    "Cross Of Valour",
  ],
});
*/
export default main;
